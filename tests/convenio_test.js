const amb = require('./lib/amb');
// Convênios (aba "Convênios" do painel + actions painelConv* do Code.gs real via fakegas): Convênio SUASA nº 991272/2025 – MAPA/ADAF.
// Os lançamentos (físicos e financeiros) são feitos no Portal do Administrativo (actions adm*; telas de web/administrativo/); o painel só mostra.
// Dados de barreira (BVA Jundiá, CEASA, Aeroporto fora da meta, volante em Tabatinga e em Manaus), levantamentos PCE de monilíase em
// 5 municípios (um só em outubro, outro de outra praga) e Termos de Fiscalização do PCE em meses diferentes desde o início da execução;
// apuração automática (1.4 municípios + propriedades por município; 1.9 turnos volantes de Tabatinga; 1.10 veículos por BVA) pelo
// servidor e na tela; lançamentos manuais (1.3, 1.5, 1.14, bem da 1.1, ajuste com justificativa), edição e exclusão; execução financeira
// (saldos e percentuais, CSV); textos do relatório salvos; relatório de setembro/2026 em PDF (impressão e arquivo) e Word (.docx: zip,
// document.xml, tabelas e números; LibreOffice converte para PDF); fiscal comum recusado; nada de CPF/nome/placa; celular 390 px; claro/escuro.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { API } = amb;
const PORTAL = require('./lib/portal');
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => get('/__gerar?nome=' + encodeURIComponent(nome) + (perfil ? '&perfil=' + perfil : ''));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))); if (!c) falhas++; };
const SAIDA = process.env.GDV_SAIDA_CONVENIO || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const salvar = (nome, buf) => { fs.writeFileSync(amb.saida('conv_' + nome), buf); if (SAIDA) fs.writeFileSync(path.join(SAIDA, nome), buf); return amb.saida('conv_' + nome); };
const shot = async (p, nome, full = true) => { await p.screenshot({ path: amb.saida('conv_' + nome + '.png'), fullPage: full }); if (SAIDA) fs.copyFileSync(amb.saida('conv_' + nome + '.png'), path.join(SAIDA, nome + '.png')); };
const py = (codigo, ...args) => { try { return execFileSync('python3', ['-c', codigo, ...args], { timeout: 60000 }).toString().trim(); } catch (e) { return null; } };

// dados pessoais usados nos registros: nenhum pode aparecer na apuração, na aba ou no relatório
const CPF = '52998224725', CPF2 = '39053344705';
const PROIBIDOS = [CPF, CPF2, '529.982.247-25', '390.533.447-05', 'Produtor Secreto', 'Fazendeira Oculta', 'Sítio Sigiloso', 'PLK1A23', 'QWE9Z87', 'Joana Fiscal', 'Pedro Volante', '-3.1190', '-4.2347'];
const agora = Date.now();
const T = (id, data, local, posto, unidade, extra = {}) => ({ id, numeroTF: 'TF-' + id, data, letra: 'A', inicio: '06:00', fim: '14:00', fiscal: 'Joana Fiscal', local, unidade, posto,
  encerrado: 1, criadoEm: agora, atualizadoEm: agora, latIni: '-3.1190', lngIni: '-60.0217', latFim: '-3.1190', lngFim: '-60.0217', ...extra });
const V = (id, turnoId, placa) => ({ id, turnoId, hora: '08:00', placa, tipo: 'PA', pessoas: 2, obs: '', excluido: 0, criadoEm: agora, atualizadoEm: agora });
const TF = (id, turnoId, data, proc, local) => ({ id, barreira: 'BVA-X', ano: 2026, numero: Number(id.replace(/\D/g, '')), turnoId, data, hora: '09:00', fiscal: 'Joana Fiscal', local, placa: 'PLK1A23',
  doc: CPF, nome: 'Produtor Secreto', procedimento: proc, produtos: '[]', cancelado: 0, criadoEm: agora, atualizadoEm: agora });
const LEV = (id, data, mun, praga, extra = {}) => ({ id, data, hora: '09:00', servidor: 'Pedro Volante', doc: CPF2, nome: 'Fazendeira Oculta', propriedade: 'Sítio Sigiloso', codigoPropriedade: '',
  municipio: mun, lat: '-4.2347', lon: '-69.9386', culturas: '[]', pragas: JSON.stringify([{ praga, culturas: [{ cultura: 'Cacau', area: '1', resultado: 'nao_detectada', coleta: 'Não' }] }]),
  fotos: '[]', assinaturas: '{}', excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });
const TPCE = (id, data, mun, extra = {}) => ({ id, unidade: mun.toUpperCase(), ano: 2026, numero: Number(id.replace(/\D/g, '')), data, hora: '10:00', municipio: mun, programa: 'moniliase',
  propriedadeId: CPF + '|SITIO SIGILOSO', doc: CPF, nome: 'Produtor Secreto', servidor: 'Pedro Volante', pragas: JSON.stringify(['Monilíase']), acoes: '[]', tipoLocal: '[]', testemunhas: '[]',
  plantasInspecionadas: 10, cancelado: 0, excluido: 0, criadoEm: agora, atualizadoEm: agora, ...extra });

(async () => {
  /* ================= 1. servidor ================= */
  console.log('1. Servidor: dados, permissões, validações e apuração');
  const MON = 'Monilíase do Cacaueiro';
  let d = await post({ action: 'sync', key: 'segredo', since: 0,
    turnos: [T('j1', '2026-03-10', 'BVA - JUNDIÁ', 'Fixa', 'BVA - JUNDIÁ'), T('j2', '2026-09-05', 'BVA - JUNDIÁ', 'Fixa', 'BVA - JUNDIÁ'),
      T('c1', '2026-09-12', 'BVA - CEASA', 'Fixa', 'BVA - CEASA'), T('a1', '2026-09-12', 'BVA - AEROPORTO', 'Fixa', 'BVA - AEROPORTO'),
      T('v1', '2026-08-20', 'Porto de Tabatinga', 'Móvel', 'TABATINGA'), T('v2', '2026-09-21', 'Porto Público', 'Móvel', 'TABATINGA'),
      T('v3', '2026-09-22', 'Estrada do Volante', 'Móvel', 'MANAUS'), T('j3', '2026-10-02', 'BVA - JUNDIÁ', 'Fixa', 'BVA - JUNDIÁ')],
    veiculos: [V('w1', 'j1', 'PLK1A23'), V('w2', 'j1', ''), V('w3', 'j1', ''), V('w4', 'j2', 'QWE9Z87'), V('w5', 'j2', ''), V('w6', 'j2', ''), V('w7', 'j2', ''),
      V('w8', 'c1', 'PLK1A23'), V('w9', 'c1', ''), V('w10', 'a1', ''), V('w11', 'a1', ''), V('w12', 'a1', ''), V('w13', 'v1', ''), V('w14', 'v1', ''), V('w15', 'v2', ''),
      V('w16', 'v3', ''), ...[1, 2, 3, 4, 5, 6].map(i => V('w2' + i, 'j3', '')), { ...V('w30', 'j2', ''), excluido: 1 }],
    tfs: [TF('t1', 'j1', '2026-03-10', 'apreensao', 'BVA - JUNDIÁ'), TF('t2', 'j2', '2026-09-05', 'apreensao', 'BVA - JUNDIÁ'), TF('t3', 'j2', '2026-09-05', 'liberacao', 'BVA - JUNDIÁ'),
      TF('t4', 'c1', '2026-09-12', 'rechaco', 'BVA - CEASA'), TF('t5', 'v1', '2026-08-20', 'liberacao', 'Porto de Tabatinga'), TF('t6', 'v2', '2026-09-21', 'apreensao', 'Porto Público'),
      { ...TF('t7', 'c1', '2026-09-12', 'apreensao', 'BVA - CEASA'), cancelado: 1 }],
    levantamentos: [LEV('m1', '2026-03-15', 'Manaus', MON, { codigoPropriedade: 'P-1' }), LEV('m2', '2026-09-03', 'Manaus', MON, { codigoPropriedade: 'P-2' }),
      LEV('m3', '2026-09-04', 'MANAUS', MON, { codigoPropriedade: 'P-1' }), LEV('m4', '2026-09-10', 'Manacapuru', MON), LEV('m5', '2026-09-11', 'Manacapuru', MON),
      LEV('m6', '2026-09-11', 'Manacapuru', MON, { doc: CPF, propriedade: 'Outra Terra' }), LEV('m7', '2026-08-15', 'Iranduba', MON, { codigoPropriedade: 'P-9' }),
      LEV('m8', '2026-09-08', 'Itacoatiara', 'Moko da bananeira'), LEV('m9', '2026-10-05', 'Careiro', MON), { ...LEV('m10', '2026-09-09', 'Humaitá', MON), excluido: 1 }],
    termosPce: [TPCE('p1', '2026-09-18', 'Autazes'), TPCE('p2', '2026-09-19', 'Coari', { cancelado: 1, motivoCancel: 'erro' })] });
  ok(d.ok, 'dados de teste sincronizados (turnos, veículos, TFs, levantamentos e termos PCE)', d.erro);
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');
  const adm = await gerar('Gerente Convênio', 'admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const fis = await gerar('Fiscal Curioso'), TOKF = (await post({ action: 'ativar', codigo: fis.codigo })).token;
  ok(TOK && TOKF, 'credenciais de administrador e de fiscal');
  const SA = await PORTAL.sessao(TOK, 'adm.convenio@gmail.com', 'Ana Convenio Administrativa');
  ok(SA.sessao, 'sessão do Portal do Administrativo (quem lança)');
  for (const a of ['painelConvenios', 'painelConvApuracao', 'painelConvSalvar', 'painelConvLancar', 'painelConvExcluir', 'painelConvFinLancar', 'painelConvFinExcluir', 'painelConvRelSalvar']) {
    const r = await post({ action: a, key: TOKF, convenio: '991272-2025', config: {}, lancamento: { etapa: '1.5' }, id: 'x', mes: '2026-09', numero: 1, textos: {} });
    ok(!r.ok && /Acesso restrito/.test(r.erro), `fiscal comum recusado em ${a}`, r);
  }
  d = await post({ action: 'painelConvenios' }); ok(!d.ok && /Sessão do painel inválida/.test(d.erro), 'sem credencial: recusado', d.erro);
  d = await post({ action: 'painelConvenios', key: TOK });
  const C = d.convenios && d.convenios[0];
  ok(d.ok && C.id === '991272-2025' && C.inicioExecucao === '2026-03-01' && C.vigencia.fim === '2027-04-01' && C.valores.global === 2268042, 'semente do convênio (nº, vigência, início da execução, valor global)', C && C.vigencia);
  const totItens = et => et.itens.reduce((s, i) => s + i.total, 0);
  ok(C.etapas.map(e => e.id).join() === '1.1,1.3,1.4,1.5,1.9,1.10,1.14' && C.etapas.find(e => e.id === '1.10').meta === 18000 && C.etapas.find(e => e.id === '1.4').meta === 52,
    'etapas e metas (1.10 = 18.000 veículos; 1.4 = 52 municípios)');
  ok(Math.round(C.etapas.filter(e => e.id !== '1.1').reduce((s, e) => s + totItens(e), 0)) === 1200000 && Math.round(totItens(C.etapas[0])) === 1068042,
    'plano de aplicação fecha: custeio 1.200.000 e investimento 1.068.042', [C.etapas.filter(e => e.id !== '1.1').reduce((s, e) => s + totItens(e), 0), totItens(C.etapas[0])]);
  ok(C.etapas.every(e => Math.round(totItens(e)) === e.valor), 'soma dos itens = valor de cada etapa');
  ok(C.assinaturas.map(a => a.nome).join('|') === 'FRANCISCO DANIEL DE OLIVEIRA SENA|STEFANO SAMUEL BERNARDO DA COSTA|SIVANDRO CAMPOS DE FREITAS', 'assinaturas da semente = nomes do relatório');
  ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}|Residencial|CEP/i.test(JSON.stringify(C)), 'semente sem CPF/endereço de dirigentes do plano de trabalho');
  const L = l => post({ action: 'admConvLancar', sessao: SA.sessao, lancamento: { convenio: '991272-2025', ...l } });
  d = await post({ action: 'painelConvLancar', key: TOK, lancamento: { convenio: '991272-2025', etapa: '1.5', submeta: 'tabatinga', data: '2026-09-01', quantidade: 1 } });
  ok(!d.ok && /Portal do Administrativo/.test(d.erro), 'painel não grava lançamentos (só o portal)', d.erro);
  const erros = [
    [{ etapa: '9.9', data: '2026-09-01', quantidade: 1 }, /Etapa inexistente/],
    [{ etapa: '1.5', submeta: 'tabatinga', data: '2028-01-01', quantidade: 1 }, /fora da vigência/],
    [{ etapa: '1.5', submeta: 'tabatinga', data: '2026-09-01', quantidade: 'dez' }, /número/],
    [{ etapa: '1.5', submeta: 'tabatinga', data: '2026-09-01', quantidade: 0 }, /maior que zero/],
    [{ etapa: '1.5', submeta: 'xx', data: '2026-09-01', quantidade: 1 }, /sub-meta/],
    [{ etapa: '1.4', tipo: 'execucao', data: '2026-09-01', quantidade: 1 }, /automaticamente/],
    [{ etapa: '1.4', data: '2026-09-01', quantidade: 2, descricao: '' }, /justificativa/],
    [{ etapa: '1.5', submeta: 'tabatinga', data: '2026-09-01', quantidade: 1, descricao: 'Produtor CPF 529.982.247-25' }, /CPF/],
    [{ etapa: '1.1', submeta: 'nao-existe', situacao: 'adquirido', data: '2026-09-01' }, /Bem inexistente/],
    [{ etapa: '1.1', submeta: 'pickup-urucurituba', situacao: 'roubado', data: '2026-09-01' }, /Situação do bem/],
    [{ etapa: '1.3', submeta: 'moniliase-risco', data: '2026-09-01', quantidade: 1, municipio: '' }, /Informe o município/]
  ];
  for (const [l, re] of erros) { const r = await L(l); ok(!r.ok && re.test(r.erro), `validação: ${re.source}`, r.erro || r); }
  const FL = l => post({ action: 'admConvFinLancar', sessao: SA.sessao, lancamento: { convenio: '991272-2025', ...l } });
  d = await FL({ etapa: '1.4', item: '1.9.1', data: '2026-09-01', valor: 10 }); ok(!d.ok && /item do plano/.test(d.erro), 'financeiro: item de outra etapa recusado', d.erro);
  d = await FL({ etapa: '1.4', item: '1.4.1', data: '2026-09-01', valor: 'abc' }); ok(!d.ok && /número/.test(d.erro), 'financeiro: valor não numérico recusado', d.erro);
  d = await FL({ etapa: '1.4', item: '1.4.1', data: '2026-09-01', valor: 10, fonte: 'outra' }); ok(!d.ok && /Fonte inválida/.test(d.erro), 'financeiro: fonte inválida recusada', d.erro);
  d = await post({ action: 'painelConvRelSalvar', key: TOK, convenio: '991272-2025', mes: '2025-01', numero: 1, textos: {} }); ok(!d.ok && /Mês de referência/.test(d.erro), 'relatório: mês fora da execução recusado', d.erro);
  d = await post({ action: 'painelConvSalvar', key: TOK, convenio: '991272-2025', config: { etapas: [{ id: '1.4', meta: -3 }] } }); ok(!d.ok && /maior que zero/.test(d.erro), 'configuração: meta negativa recusada', d.erro);

  const AP = await post({ action: 'painelConvApuracao', key: TOK, convenio: '991272-2025', de: '2026-03-01', ate: '2026-09-30' });
  const a14 = AP.etapas['1.4'], a19 = AP.etapas['1.9'], a110 = AP.etapas['1.10'];
  const pm = Object.fromEntries(a14.porMunicipio.map(x => [x.municipio.toLowerCase(), x]));
  ok(a14.porMunicipio.length === 4 && pm.manaus.propriedades === 2 && pm.manaus.registros === 3 && pm.manacapuru.propriedades === 2 && pm.iranduba.propriedades === 1 && pm.autazes.propriedades === 1,
    '1.4: 4 municípios (Manaus 2 prop./3 reg., Manacapuru 2, Iranduba 1, Autazes 1 pelo termo); sem Itacoatiara (outra praga), Careiro (outubro), Humaitá (excluído) nem Coari (termo cancelado)', a14.porMunicipio);
  ok(a14.meses['2026-09'].municipios.length === 3 && a14.meses['2026-03'].municipios.length === 1 && a14.meses['2026-08'].municipios.join() === 'Iranduba', '1.4: municípios distintos por mês (set = 3, mar = 1, ago = Iranduba)', a14.meses);
  ok(a19.porMunicipio.length === 1 && a19.porMunicipio[0].total.turnos === 2 && a19.porMunicipio[0].total.tfs === 2 && a19.porMunicipio[0].total.veiculos === 3 && a19.meses['2026-09'].turnos === 1,
    '1.9: 2 turnos volantes em Tabatinga (1 em setembro), 2 TFs, 3 veículos; volante em Manaus fora', a19);
  const bj = a110.porBva.find(b => b.bva === 'BVA - JUNDIÁ'), bc = a110.porBva.find(b => b.bva === 'BVA - CEASA');
  ok(bj.total.veiculos === 7 && bj.total.tfs === 3 && bj.total.apreensoes === 2 && bc.total.veiculos === 2 && bc.total.tfs === 1 && bc.total.rechacos === 1 && a110.meses['2026-09'].veiculos === 6,
    '1.10: Jundiá 7 veículos/3 TFs/2 apreensões, CEASA 2 veículos/1 rechaço (TF cancelado fora), setembro 6; Aeroporto e outubro fora', a110);
  const apJson = JSON.stringify(AP);
  ok(!PROIBIDOS.some(x => apJson.includes(x)), 'apuração sem CPF, nomes, placas ou coordenadas', PROIBIDOS.filter(x => apJson.includes(x)));
  d = await post({ action: 'painelConvApuracao', key: TOK, convenio: '991272-2025', de: '2026-03-01', ate: '2026-10-31' });
  ok(d.etapas['1.4'].porMunicipio.length === 5 && d.etapas['1.10'].porBva[0].total.veiculos === 13, 'intervalo até outubro: Careiro e o turno de outubro entram (acumulado depende só do intervalo pedido)');
  // um lançamento via API (agosto) que depois será excluído pela tela e outro que fica
  d = await L({ etapa: '1.5', submeta: 'urucurituba', data: '2026-08-20', quantidade: 36, descricao: 'Ações de supressão' });
  ok(d.ok && d.lancamento.municipio === 'Urucurituba' && d.lancamento.usuario === 'Ana Convenio Administrativa', 'lançamento 1.5 Urucurituba (município da sub-meta; quem lançou no portal)', d);
  d = await L({ etapa: '1.14', submeta: 'tabatinga', data: '2026-09-25', quantidade: 5, descricao: 'lançado errado' });
  const ID_ERRADO = d.lancamento && d.lancamento.id;
  ok(d.ok, 'lançamento 1.14 Tabatinga (será excluído na tela)');

  /* ================= 2. painel ================= */
  console.log('2. Painel → aba Convênios');
  const b = await amb.lancar();
  const errosPag = [];
  async function abrir(opts = {}) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', acceptDownloads: true, ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    await c.addInitScript(([tok, url]) => {
      if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'Gerente Convênio'); }
      // impressão do relatório: captura o texto do documento (iframe) em vez de abrir o diálogo
      if (window !== window.top) window.print = () => { const dd = document; window.top.__prints = window.top.__prints || []; window.top.__prints.push({ texto: dd.body.innerText.replace(/\s+/g, ' '), html: dd.body.innerHTML }); };
    }, [TOK, amb.API_URL]);
    const p = await c.newPage();
    p.on('pageerror', e => errosPag.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errosPag.push(m.text()); });
    p.on('dialog', dl => dl.accept());
    await p.goto(amb.PAINEL);
    await p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 });
    return p;
  }
  const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const p = await abrir();
  ok(await p.isVisible('.pn-aba[data-aba=convenios]'), 'aba "Convênios" no painel do administrador');
  await p.click('.pn-aba[data-aba=convenios]');
  await p.waitForSelector('.pn-conv-etapa', { timeout: 20000 });
  ok(await p.isHidden('.pn-filtros'), 'aba sem filtros de período (independe do período carregado)');
  ok(await p.inputValue('#pn-conv-mes') === new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 7) || await p.inputValue('#pn-conv-mes') === '2027-04', 'mês de referência padrão = mês corrente', await p.inputValue('#pn-conv-mes'));
  const meses = await p.$$eval('#pn-conv-mes option', os => os.map(o => o.value));
  ok(meses[meses.length - 1] === '2026-03' && meses.includes('2026-09'), 'meses desde o início da execução (março/2026)', meses.slice(-3));
  await p.selectOption('#pn-conv-mes', '2026-09');
  await p.waitForFunction(() => Painel.aba('convenios').estado().mes === '2026-09' && Painel.aba('convenios').estado().R && Painel.aba('convenios').estado().R.mes === '2026-09', null, { timeout: 20000 });
  await p.waitForSelector('.pn-conv-etapa');
  const topo = await p.textContent('.pn-conv-topo');
  ok(/991272\/2025/.test(topo) && /01\/12\/2025 a 01\/04\/2027/.test(topo) && /R\$\s?2\.268\.042,00/.test(topo) && /Prazo decorrido/.test(topo), 'cabeçalho: nº, vigência, prazo decorrido e valor global', topo.slice(0, 300));
  const est = () => p.evaluate(() => { const R = Painel.aba('convenios').estado().R; return { esperado: R.esperado, alertas: R.alertas, etapas: Object.fromEntries(R.etapas.map(r => [r.id, { mes: r.mes, acum: r.acum, pct: r.pct, situacao: r.situacao, linhas: r.linhas.map(l => [l.rotulo, l.mes, l.acum]) }])), fin: R.fin.total }; });
  let S = await est();
  ok(S.etapas['1.4'].acum === 4 && S.etapas['1.4'].mes === 3 && Math.abs(S.etapas['1.4'].pct - 4 / 52) < 1e-9, 'tela 1.4: 4 municípios acumulados, 3 em setembro, 7,69%', S.etapas['1.4']);
  ok(JSON.stringify(S.etapas['1.4'].linhas.find(l => l[0] === 'Manaus')) === '["Manaus",2,2]' && S.etapas['1.4'].linhas.some(l => l[0] === 'Iranduba' && l[1] === 0 && l[2] === 1), 'tela 1.4: propriedades por município (Manaus 2; Iranduba 0 no mês, 1 acum.)', S.etapas['1.4'].linhas);
  ok(S.etapas['1.9'].acum === 2 && S.etapas['1.9'].mes === 1 && S.etapas['1.10'].acum === 9 && S.etapas['1.10'].mes === 6, 'tela 1.9 (2 ações, 1 no mês) e 1.10 (9 veículos, 6 no mês)', [S.etapas['1.9'], S.etapas['1.10']]);
  ok(Math.abs(S.esperado - 214 / 397) < 1e-9, 'esperado pelo tempo (linear de 01/03/2026 a 01/04/2027) = 53,90% no fim de setembro', S.esperado);
  ok(S.etapas['1.10'].situacao === 'atrasada' && S.alertas.some(a => a.nivel === 'serio' && /Etapa 1.10 atrasada/.test(a.titulo)), 'alerta: etapa atrasada mais de 15 p.p.', S.alertas.map(a => a.titulo));
  ok(await p.isVisible('.pn-conv-etapa[data-etapa="1.4"] .pn-selo') && /Atrasada/.test(await p.textContent('.pn-conv-etapa[data-etapa="1.4"] .pn-selo')), 'cartão da etapa com situação (texto, não só cor)');
  await p.click('.pn-conv-etapa[data-etapa="1.4"] summary');
  await p.waitForSelector('.pn-conv-etapa[data-etapa="1.4"] canvas', { timeout: 10000 });
  const det = await p.textContent('.pn-conv-etapa[data-etapa="1.4"] .pn-conv-det-corpo');
  ok(/Manaus \(2 propriedades\)/.test(det) && /Manacapuru \(2 propriedades\)/.test(det) && /Autazes/.test(det) && !/Itacoatiara|Careiro/.test(det), 'detalhe 1.4: memória com municípios e propriedades; quebra por município; gráfico mensal', det.slice(0, 300));
  await p.click('.pn-conv-etapa[data-etapa="1.10"] summary'); await p.waitForSelector('.pn-conv-etapa[data-etapa="1.10"] canvas', { timeout: 10000 });
  ok(/BVA - JUNDIÁ/.test(await p.textContent('.pn-conv-etapa[data-etapa="1.10"] .pn-conv-det-corpo')), 'detalhe 1.10 por BVA');
  await p.waitForTimeout(1200); await shot(p, 'metas_setembro');                    // espera a animação dos gráficos
  // mês de outubro: 1.9 sem turno volante → alerta "sem registro"
  await p.selectOption('#pn-conv-mes', '2026-10');
  await p.waitForFunction(() => Painel.aba('convenios').estado().R && Painel.aba('convenios').estado().R.mes === '2026-10', null, { timeout: 20000 });
  S = await est();
  ok(S.alertas.some(a => /Etapa 1.9 sem nenhum registro em outubro\/2026/.test(a.titulo)) && !S.alertas.some(a => /Etapa 1.10 sem/.test(a.titulo)), 'alerta: mês sem registro numa etapa automática (1.9 em outubro)', S.alertas.map(a => a.titulo));
  ok(S.etapas['1.4'].acum === 5 && S.etapas['1.10'].acum === 15, 'outubro: acumulado inclui Careiro e o turno de outubro', [S.etapas['1.4'].acum, S.etapas['1.10'].acum]);
  await p.selectOption('#pn-conv-mes', '2026-09');
  await p.waitForFunction(() => Painel.aba('convenios').estado().R.mes === '2026-09', null, { timeout: 20000 });

  /* ---- lançamentos ---- */
  console.log('3. Lançamentos manuais (Portal do Administrativo)');
  await p.click('[data-conv=visao][data-v=lanc]'); await p.waitForSelector('#pn-conv-portal');
  ok(!(await p.$('#pn-conv-lanc-form')) && /Portal do Administrativo/.test(await p.textContent('#pn-conv-visao')), 'painel → Lançamentos: só leitura, com o aviso e o link para o portal');
  const pa = await PORTAL.abrir(b, SA, { aba: 'fisico' });
  await pa.waitForSelector('#pn-conv-lanc-form', { timeout: 20000 });
  const recarregarPainel = async () => { await p.evaluate(() => Painel.aba('convenios').recarregar()); await p.waitForFunction(() => { const s = Painel.aba('convenios').estado(); return s.R && s.R.mes === '2026-09' && !document.querySelector('#pn-conv-visao.carregando'); }, null, { timeout: 20000 }); };
  const lancar = async (o) => {
    await pa.selectOption('#pn-cl-etapa', o.etapa);
    if (o.sub) await pa.selectOption('#pn-cl-sub', o.sub);
    if (o.bem) { await pa.selectOption('#pn-cl-bem', o.bem); await pa.selectOption('#pn-cl-sit', o.sit); }
    if (o.mun != null) await pa.fill('#pn-cl-mun', o.mun);
    await pa.fill('#pn-cl-data', o.data);
    if (o.qtd != null) await pa.fill('#pn-cl-qtd', String(o.qtd));
    if (o.arm != null) await pa.fill('#pn-cl-arm', String(o.arm));
    if (o.prop != null) await pa.fill('#pn-cl-prop', String(o.prop));
    await pa.fill('#pn-cl-desc', o.desc || ''); await pa.fill('#pn-cl-doc', o.doc || '');
    const n = await pa.evaluate(() => AdmConvenio.estado().dados.lancamentos.length);
    await pa.click('#pn-cl-salvar');
    if (o.erro) { await pa.waitForFunction(() => /erro/.test((document.querySelector('[data-msg=lanc]') || {}).className || ''), null, { timeout: 10000 }); return pa.textContent('[data-msg=lanc]'); }
    await pa.waitForFunction(n0 => AdmConvenio.estado().dados.lancamentos.length > n0 || /Lançado/.test((document.querySelector('[data-msg=lanc]') || {}).textContent || ''), n, { timeout: 10000 });
    await pa.waitForSelector('#pn-conv-lanc-form');
    return pa.textContent('[data-msg=lanc]');
  };
  await pa.selectOption('#pn-cl-etapa', '1.3');
  ok(await pa.isVisible('#pn-cl-arm') && await pa.isVisible('#pn-cl-sub') && await pa.isHidden('#pn-cl-bem'), 'formulário 1.3: sub-meta e nº de armadilhas');
  ok(/Lançado/.test(await lancar({ etapa: '1.3', sub: 'nhamunda', data: '2026-09-10', qtd: 2, arm: 21, desc: 'Monitoramento quinzenal' })), 'lançamento 1.3 Nhamundá: 2 monitoramentos, 21 armadilhas');
  await pa.selectOption('#pn-cl-etapa', '1.3'); await pa.selectOption('#pn-cl-sub', 'moniliase-risco');
  ok(await pa.isHidden('#pn-cl-arm') && /municípios distintos/.test(await pa.textContent('#pn-cl-dica')), 'sub-meta por municípios: sem armadilhas, com dica');
  ok(/Lançado/.test(await lancar({ etapa: '1.3', sub: 'moniliase-risco', mun: 'Coari', data: '2026-09-12', qtd: 1, prop: 3, desc: 'Vigilância em área de alto risco' })), 'lançamento 1.3 monilíase em Coari (3 propriedades)');
  ok(/Lançado/.test(await lancar({ etapa: '1.5', sub: 'benjamin-constant', data: '2026-09-15', qtd: 10, desc: 'Supressão' })), 'lançamento 1.5 Benjamin Constant: 10 ações');
  ok(/Lançado/.test(await lancar({ etapa: '1.14', sub: 'jundia', data: '2026-09-20', qtd: 1, desc: 'Supervisão na BVA do Jundiá', doc: 'Relatório de supervisão 01' })), 'lançamento 1.14 Jundiá: 1 supervisão');
  await pa.selectOption('#pn-cl-etapa', '1.1');
  ok(await pa.isVisible('#pn-cl-bem') && await pa.isVisible('#pn-cl-sit') && await pa.isHidden('#pn-cl-qtd'), 'formulário 1.1: bem e situação (sem quantidade)');
  ok(/Lançado/.test(await lancar({ etapa: '1.1', bem: 'pickup-urucurituba', sit: 'em_aquisicao', data: '2026-08-01', desc: 'Processo licitatório' })), 'bem 1.1: pick-up em aquisição (agosto)');
  ok(/Lançado/.test(await lancar({ etapa: '1.1', bem: 'pickup-urucurituba', sit: 'entregue', data: '2026-09-02', doc: 'NF 4521' })), 'bem 1.1: pick-up entregue (setembro)');
  await pa.selectOption('#pn-cl-etapa', '1.4');
  ok(/Ajuste/.test(await pa.textContent('#pn-cl-qtd-rot')) && /obrigatória/.test(await pa.textContent('#pn-cl-desc-rot')), 'etapa automática: campo de ajuste e justificativa obrigatória');
  ok(/justificativa/i.test(await lancar({ etapa: '1.4', data: '2026-03-31', qtd: 11, desc: '', erro: true })), 'ajuste sem justificativa: recusado na tela');
  ok(/Lançado/.test(await lancar({ etapa: '1.4', data: '2026-03-31', qtd: 11, desc: 'Levantamentos de março a junho anotados em papel, antes do e-GDV' })), 'ajuste 1.4: +11 com justificativa');
  // editar (1.5 Benjamin Constant: 10 → 12) e excluir o lançamento errado da 1.14
  const idBC = await pa.evaluate(() => AdmConvenio.estado().dados.lancamentos.find(l => l.submeta === 'benjamin-constant').id);
  await pa.click(`[data-conv=lanc-editar][data-id="${idBC}"]`); await pa.waitForSelector('#pn-cl-salvar:has-text("Salvar alteração")');
  ok(await pa.inputValue('#pn-cl-qtd') === '10' && await pa.inputValue('#pn-cl-etapa') === '1.5', 'editar: formulário preenchido com o lançamento');
  await pa.fill('#pn-cl-qtd', '12'); await pa.click('#pn-cl-salvar');
  await pa.waitForFunction(id => AdmConvenio.estado().dados.lancamentos.find(l => l.id === id).quantidade === 12, idBC, { timeout: 10000 });
  ok(true, 'lançamento editado (12 ações)');
  await pa.click(`[data-conv=lanc-excluir][data-id="${ID_ERRADO}"]`);
  await pa.waitForFunction(id => !AdmConvenio.estado().dados.lancamentos.some(l => l.id === id), ID_ERRADO, { timeout: 10000 });
  const linhaExc = (await get('/__aba?nome=ConvLancamentos')).find(r => r[0] === ID_ERRADO);
  ok(linhaExc && linhaExc[14] === 1 && linhaExc[11] === 'Ana Convenio Administrativa', 'exclusão lógica: excluido = 1 e quem excluiu na planilha', linhaExc);
  await shot(pa, 'portal_lancamentos');
  await recarregarPainel();
  ok(/Entregue/.test(await pa.textContent('#pn-conv-visao')) && /NF 4521/.test(await pa.textContent('#pn-conv-visao')), 'portal: lista de bens com a situação (entregue, NF)');
  S = await est();
  ok(S.etapas['1.4'].acum === 15 && S.etapas['1.4'].mes === 3, '1.4 com ajuste: 15 acumulados (ajuste em março não entra no mês)', S.etapas['1.4']);
  ok(S.etapas['1.5'].acum === 48 && S.etapas['1.5'].mes === 12 && S.etapas['1.14'].acum === 1 && S.etapas['1.1'].acum === 1 && S.etapas['1.1'].mes === 1,
    '1.5 = 48 (36 + 12), 1.14 = 1 (excluído não conta), 1.1 = 1 bem entregue no mês', [S.etapas['1.5'], S.etapas['1.14'], S.etapas['1.1']]);
  const s13 = S.etapas['1.3'];
  ok(Math.abs(s13.pct - (2 / 24 + 1 / 5) / 4) < 1e-9, '1.3: % = média das sub-metas ((2/24 + 0 + 0 + 1/5) / 4)', s13);
  await shot(p, 'lancamentos');

  /* ---- financeiro ---- */
  console.log('4. Execução financeira');
  await PORTAL.aba(pa, 'desembolso'); await pa.waitForSelector('#pn-conv-fin-form');
  const fin = async o => {
    await pa.selectOption('#pn-cf-etapa', o.etapa); await pa.selectOption('#pn-cf-item', o.item); await pa.fill('#pn-cf-data', o.data);
    await pa.fill('#pn-cf-valor', o.valor); await pa.fill('#pn-cf-qtd', o.qtd || ''); if (o.fonte) await pa.selectOption('#pn-cf-fonte', o.fonte);
    await pa.fill('#pn-cf-doc', o.doc || ''); await pa.fill('#pn-cf-desc', o.desc || '');
    const n = await pa.evaluate(() => AdmConvenio.estado().dados.financeiro.length);
    await pa.click('#pn-cf-salvar');
    await pa.waitForFunction(n0 => AdmConvenio.estado().dados.financeiro.length > n0, n, { timeout: 10000 });
    await pa.waitForSelector('#pn-conv-fin-form');
  };
  await fin({ etapa: '1.4', item: '1.4.1', data: '2026-09-05', qtd: '100', valor: '1.200,00', doc: 'NE 2026NE000123', desc: 'Gasolina setembro' });
  await fin({ etapa: '1.10', item: '1.10.3', data: '2026-08-10', qtd: '10', valor: '2520', doc: 'PCDP 77/2026' });
  await fin({ etapa: '1.1', item: '1.1.4', data: '2026-09-02', qtd: '1', valor: '68.042,00', fonte: 'contrapartida', doc: 'NF 4521' });
  await fin({ etapa: '1.9', item: '1.9.2', data: '2026-10-03', valor: '2.500,00', doc: 'Bilhete 1' });     // outubro: não entra em setembro
  await recarregarPainel();
  S = await est();
  ok(Math.abs(S.fin.acum - (1200 + 2520 + 68042)) < 0.001 && Math.abs(S.fin.mes - (1200 + 68042)) < 0.001, 'financeiro: acumulado R$ 71.762,00 (outubro fora), setembro R$ 69.242,00', S.fin);
  const finR = await p.evaluate(() => { const F = Painel.aba('convenios').estado().R.fin; return { e14: F.etapas.find(e => e.id === '1.4'), n30: F.naturezas.find(n => n.natureza === '33.90.30'), fonte: F.fonte }; });
  ok(finR.e14.saldo === 139820 && Math.abs(finR.e14.pct - 1200 / 141020) < 1e-12 && finR.n30.acum === 1200 && finR.fonte.contrapartida.acum === 68042 && finR.fonte.contrapartida.pct === 1 && finR.fonte.concedente.acum === 3720,
    'saldo da 1.4 = R$ 139.820,00 (0,85%); natureza 33.90.30; contrapartida 100%; repasse R$ 3.720,00', finR);
  await p.click('[data-conv=visao][data-v=fin]'); await p.waitForSelector('#pn-conv-portal');
  ok(!(await p.$('#pn-conv-fin-form')) && !(await p.$('#pn-conv-imp-arq')), 'painel → Financeiro: só leitura (sem formulário nem importação)');
  const txFin = await p.textContent('#pn-conv-visao');
  ok(/R\$\s?139\.820,00/.test(txFin) && /0,85%/.test(txFin) && /NE 2026NE000123/.test(txFin), 'tela do financeiro: saldo, % e documento', txFin.slice(0, 200));
  d = await FL({ etapa: '1.4', item: '1.4.2', data: '2026-09-01', valor: 10, descricao: 'favorecido 529.982.247-25' }); ok(!d.ok && /CPF/.test(d.erro), 'financeiro: CPF do favorecido recusado', d.erro);
  const [dlCsv] = await Promise.all([p.waitForEvent('download'), p.click('#pn-conv-visao .pn-secao:last-child .pn-tab-acoes button')]);   // CSV do painel (sem nomes)
  const csv = fs.readFileSync(await dlCsv.path(), 'utf8');
  ok(/Valor/.test(csv) && /1200/.test(csv) && /NE 2026NE000123/.test(csv) && /68042/.test(csv), 'exportar CSV dos lançamentos financeiros', csv.slice(0, 200));
  salvar('financeiro.csv', csv);
  await shot(p, 'financeiro');
  await shot(pa, 'portal_desembolso');
  ok(!pa.errosPag.length, 'portal sem erros de JavaScript', pa.errosPag);
  await pa.context().close();

  /* ---- relatório ---- */
  console.log('5. Relatório mensal (setembro/2026)');
  await p.click('[data-conv=visao][data-v=rel]'); await p.waitForSelector('#pn-conv-rel-abrir');
  ok(/Gerar relatório de setembro\/2026/.test(await p.textContent('#pn-conv-rel-abrir')), 'botão "Gerar relatório de setembro/2026"');
  await p.click('#pn-conv-rel-abrir'); await p.waitForSelector('#pn-conv-rel-form');
  ok(await p.inputValue('#pn-cr-numero') === '7', 'Parcial nº automático = 7 (março = 1)');
  ok(/Termos de Fiscalização emitidos/.test(await p.inputValue('#pn-cr-1_9-evidencias')), 'textos pré-preenchidos com os do relatório de referência');
  await p.fill('#pn-cr-1_4-evidencias', 'Evidência própria da etapa 1.4 (fichas e TFs).');
  await p.fill('#pn-cr-g-conclusao', 'Conclusão escrita pelo gerente para setembro.');
  await p.click('#pn-cr-salvar');
  await p.waitForFunction(() => /Salvo/.test(document.querySelector('[data-msg=rel]').textContent), null, { timeout: 10000 });
  const rels = await get('/__aba?nome=ConvRelatorios');
  ok(rels.length === 2 && rels[1][0] === '991272-2025|2026-09' && rels[1][3] === 7 && /Evidência própria da etapa 1.4/.test(rels[1][4]), 'textos salvos na aba ConvRelatorios (id convênio|mês, parcial 7)', rels[1]);
  // impressão (texto do documento) — conteúdo do PDF
  await p.evaluate(() => { window.__prints = []; });
  await p.click('#pn-cr-imprimir');
  await p.waitForFunction(() => window.__prints && window.__prints.length, null, { timeout: 20000 });
  const pr = await p.evaluate(() => window.__prints[0]);
  const tx = pr.texto;
  ok(/RELATÓRIO CIRCUNSTANCIAL TÉCNICO DE EXECUÇÃO FÍSICA DAS METAS – PARCIAL 7/.test(tx) && /Convênio SUASA nº 991272\/2025/.test(tx) && /setembro\/2026/.test(tx), 'PDF: título, parcial, convênio e período', tx.slice(0, 300));
  ok(/RESUMO DE EXECUÇÃO DE METAS/.test(tx) && /52 municípios levantados/.test(tx) && /18\.000 veículos fiscalizados/.test(tx) && /Benjamin Constant/.test(tx), 'PDF: tabela-resumo (etapa, município, prevista, executada, %)');
  ok(/nos municípios: Manacapuru \(2 propriedades\), Manaus \(2 propriedades\), Autazes \(1 propriedade\), Iranduba \(1 propriedade\)\./.test(tx) && /Iranduba \(1 propriedade\)/.test(tx) && /ajuste manual de \+11/.test(tx), 'PDF: memória descritiva com municípios e propriedades (e o ajuste)', (tx.match(/Etapa 1\.4:.{0,300}/) || [''])[0]);
  ok(/BVA - JUNDIÁ: 7 veículos abordados, 3 Termos de Fiscalização, 2 apreensões e 0 rechaços/.test(tx) && /BVA - CEASA: 2 veículos abordados, 1 Termo de Fiscalização, 0 apreensões e 1 rechaço/.test(tx), 'PDF: 1.10 por BVA (veículos, TFs, apreensões, rechaços)');
  ok(/Tabatinga: 2 ações, com 2 Termos de Fiscalização/.test(tx), 'PDF: 1.9 ações e TFs');
  ok(/Evidência própria da etapa 1\.4/.test(tx) && /Conclusão escrita pelo gerente/.test(tx), 'PDF: textos editados');
  ok(/8\. EXECUÇÃO FINANCEIRA/.test(tx) && /R\$ 139\.820,00/.test(tx) && /Por natureza de despesa/.test(tx) && /Contrapartida \(convenente\)/.test(tx), 'PDF: execução financeira (etapa, natureza, fonte, saldo)');
  ok(/FRANCISCO DANIEL DE OLIVEIRA SENA/.test(tx) && /Gerente de Defesa Vegetal\/ADAF/.test(tx) && /Manaus\/AM, \d+ de \w+ de 20\d\d/.test(tx), 'PDF: local/data e assinaturas');
  ok(!PROIBIDOS.some(x => tx.includes(x)), 'PDF: sem CPF, nome de produtor, servidor de campo, placa ou coordenada', PROIBIDOS.filter(x => tx.includes(x)));
  salvar('relatorio_setembro_2026.html', '<!DOCTYPE html><meta charset="utf-8">' + pr.html);
  // PDF gerado no navegador (arquivo)
  const [dlPdf] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#pn-cr-pdf')]);
  const pdfNome = dlPdf.suggestedFilename(), pdf = fs.readFileSync(await dlPdf.path());
  const pdfArq = salvar(pdfNome, pdf);
  const npag = Number(py('import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', pdfArq));
  ok(pdf.slice(0, 5).toString() === '%PDF-' && /Relatorio_Convenio_991272-2025_Parcial_7_2026-09\.pdf/.test(pdfNome) && npag >= 4, 'Baixar PDF: arquivo PDF com várias páginas', [pdfNome, pdf.length, npag]);
  // Word
  const [dlDoc] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#pn-cr-docx')]);
  const docNome = dlDoc.suggestedFilename(), docx = fs.readFileSync(await dlDoc.path());
  const docArq = salvar(docNome, docx);
  ok(docx.slice(0, 2).toString() === 'PK' && /\.docx$/.test(docNome), 'Baixar Word: arquivo .docx (zip)', [docNome, docx.length]);
  const info = py(`import sys,zipfile,json
from xml.dom import minidom
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
nomes=z.namelist(); x=z.read('word/document.xml').decode('utf-8'); minidom.parseString(x)
for n in nomes:
    if n.endswith('.xml') or n.endswith('.rels'): minidom.parseString(z.read(n))
import docx
d=docx.Document(sys.argv[1])
txt='\\n'.join(p.text for p in d.paragraphs)
cel=[c.text for t in d.tables for r in t.rows for c in r.cells]
print(json.dumps({'nomes':nomes,'tabelas':x.count('<w:tbl>'),'bordas':x.count('w:insideH'),'vmerge':x.count('w:vMerge'),'txt':txt,'cel':cel,'imgs':[n for n in nomes if n.startswith('word/media/')]}))`, docArq);
  const W = info ? JSON.parse(info) : null;
  ok(W && W.nomes.includes('[Content_Types].xml') && W.nomes.includes('word/document.xml') && W.nomes.includes('word/styles.xml') && W.imgs.length === 3, 'docx: pacote OOXML válido (XML bem formado; cabeçalho e rodapé com 3 logos)', W && W.nomes);
  ok(W && W.tabelas === 5 && W.bordas === 5 && W.vmerge > 0, 'docx: 5 tabelas com bordas (resumo + 3 financeiras + físico × financeiro) e células mescladas', W && [W.tabelas, W.bordas, W.vmerge]);
  const celTxt = W ? W.cel.join(' | ') : '';
  ok(W && /PARCIAL 7/.test(W.txt) && /Manacapuru \(2 propriedades\), Manaus \(2 propriedades\)/.test(W.txt) && /R\$ 139\.820,00/.test(celTxt) && /52 municípios levantados/.test(celTxt) && /BVA - JUNDIÁ/.test(celTxt) && /15/.test(celTxt),
    'docx: textos e números (parcial, memória, resumo, financeiro)', W && W.txt.slice(0, 200));
  ok(W && !PROIBIDOS.some(x => (W.txt + celTxt).includes(x)), 'docx: sem dados pessoais');
  try {
    const out = amb.saida('conv_lo'); fs.mkdirSync(out, { recursive: true });
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, docArq], { timeout: 120000, stdio: 'pipe' });
    const pdfLo = path.join(out, path.basename(docArq).replace(/\.docx$/, '.pdf'));
    const nLo = Number(py('import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', pdfLo));
    const tLo = py('import sys,pypdf;print(" ".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', pdfLo) || '';
    ok(nLo >= 4 && /RESUMO DE EXECUÇÃO/.test(tLo) && /139\.820,00/.test(tLo), 'LibreOffice converte o .docx para PDF sem erro (texto e tabelas)', [nLo, tLo.slice(0, 120)]);
    if (SAIDA) fs.copyFileSync(pdfLo, path.join(SAIDA, 'docx_convertido_libreoffice.pdf'));
  } catch (e) { console.log('  (LibreOffice indisponível: conversão não testada) ' + String(e.message).slice(0, 100)); }
  await shot(p, 'relatorio');
  // recarregar: textos persistem e o mês seguinte herda os de setembro
  await p.reload(); await p.waitForSelector('.pn-conv-etapa, #pn-conv-rel-abrir', { timeout: 30000 });
  await p.selectOption('#pn-conv-mes', '2026-10');
  await p.waitForFunction(() => Painel.aba('convenios').estado().R && Painel.aba('convenios').estado().R.mes === '2026-10', null, { timeout: 20000 });
  await p.click('#pn-conv-rel-abrir'); await p.waitForSelector('#pn-conv-rel-form');
  ok(await p.inputValue('#pn-cr-numero') === '8' && /Evidência própria da etapa 1\.4/.test(await p.inputValue('#pn-cr-1_4-evidencias')) && /setembro\/2026/.test(await p.textContent('.pn-conv-rel-topo')),
    'outubro: parcial 8 e textos pré-preenchidos com o relatório de setembro');

  /* ---- configuração ---- */
  console.log('6. Editar convênio');
  await p.click('#pn-conv-editar'); await p.waitForSelector('#pn-conv-cfg[open]');
  ok(await p.isChecked('#pn-conv-cfg [data-bva][value="BVA - JUNDIÁ"]') && await p.isChecked('#pn-conv-cfg [data-bva][value="BVA - CEASA"]') && !(await p.isChecked('#pn-conv-cfg [data-bva][value="BVA - AEROPORTO"]')),
    'BVAs da 1.10 escolhidas entre as de CONFIG.bvas (Jundiá e CEASA marcadas; Aeroporto não)');
  ok(await p.inputValue('#pn-cc-an2') === 'SIVANDRO CAMPOS DE FREITAS', 'assinaturas editáveis');
  await p.check('#pn-conv-cfg [data-bva][value="BVA - AEROPORTO"]');
  await p.fill('#pn-cc-meta-1_14', '8');
  await p.fill('#pn-cc-objeto', 'Fortalecimento das ações de Defesa Sanitária Vegetal no Estado do Amazonas (editado)');
  await p.click('#pn-cc-salvar');
  await p.waitForSelector('#pn-conv-cfg', { state: 'detached', timeout: 15000 });
  await p.waitForFunction(() => { const R = Painel.aba('convenios').estado().R; return R && R.cfg.versao >= 1 && R.etapas.find(e => e.id === '1.10').acum === 18; }, null, { timeout: 20000 });
  S = await est();
  ok(S.etapas['1.10'].acum === 18 && S.etapas['1.14'].pct === 1 / 8, 'configuração salva: BVA do Aeroporto entra na 1.10 (18 veículos até outubro) e meta da 1.14 = 8', [S.etapas['1.10'].acum, S.etapas['1.14'].pct]);
  const cfgSalva = (await get('/__aba?nome=Convenios'));
  ok(cfgSalva.length === 2 && /\(editado\)/.test(cfgSalva[1][1]) && cfgSalva[1][3] === 'Gerente Convênio', 'configuração na aba Convenios (JSON, quem salvou)');

  /* ---- celular, escuro ---- */
  console.log('7. Celular (390 px), claro e escuro');
  for (const [tema, esquema] of [['claro', 'light'], ['escuro', 'dark']]) {
    const pc = await abrir({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: esquema });
    await pc.click('.pn-aba[data-aba=convenios]'); await pc.waitForSelector('.pn-conv-etapa', { timeout: 20000 });
    await pc.selectOption('#pn-conv-mes', '2026-09');
    await pc.waitForFunction(() => Painel.aba('convenios').estado().R && Painel.aba('convenios').estado().R.mes === '2026-09', null, { timeout: 20000 });
    await pc.click('.pn-conv-etapa[data-etapa="1.10"] summary'); await pc.waitForSelector('.pn-conv-etapa[data-etapa="1.10"] canvas');
    const visoes = [];
    for (const v of ['metas', 'lanc', 'fin', 'rel']) {
      await pc.click(`[data-conv=visao][data-v=${v}]`); await pc.waitForTimeout(300);
      if (v === 'rel') { await pc.click('#pn-conv-rel-abrir'); await pc.waitForSelector('#pn-conv-rel-form'); }
      visoes.push([v, await semRolagem(pc)]);
      await shot(pc, `celular_${tema}_${v}`);
    }
    ok(visoes.every(x => x[1]), `celular ${tema}: sem rolagem horizontal em Metas, Lançamentos, Financeiro e Relatório`, visoes);
    await pc.click('[data-conv=visao][data-v=metas]'); await pc.click('#pn-conv-editar'); await pc.waitForSelector('#pn-conv-cfg[open]');
    ok(await semRolagem(pc) && await pc.evaluate(() => { const r = document.querySelector('#pn-conv-cfg').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), `celular ${tema}: diálogo "Editar convênio" cabe na tela`);
    await shot(pc, `celular_${tema}_editar`, false);
    if (esquema === 'dark') ok(await pc.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(13, 13, 13)', 'tema escuro aplicado');
    await pc.context().close();
  }
  const pe = await abrir({ colorScheme: 'dark' });
  await pe.click('.pn-aba[data-aba=convenios]'); await pe.waitForSelector('.pn-conv-etapa', { timeout: 20000 });
  await pe.selectOption('#pn-conv-mes', '2026-09'); await pe.waitForFunction(() => Painel.aba('convenios').estado().R.mes === '2026-09', null, { timeout: 20000 });
  await pe.click('.pn-conv-etapa[data-etapa="1.4"] summary'); await pe.waitForSelector('.pn-conv-etapa[data-etapa="1.4"] canvas');
  await shot(pe, 'metas_escuro');
  await pe.context().close();
  const aba = await p.textContent('#pn-conv');
  ok(!PROIBIDOS.some(x => aba.includes(x)), 'aba sem dados pessoais', PROIBIDOS.filter(x => aba.includes(x)));
  ok(!errosPag.length, 'sem erros de JavaScript na página', errosPag.slice(0, 5));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
