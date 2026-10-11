const amb = require('./lib/amb');
// Aba "Servidores" do painel: actions painelGerarCodigo / painelAcessos / painelRevogar (Code.gs real via fakegas) + Playwright no painel.
const { chromium } = require('playwright-core');
const { API, PAINEL: WEB } = amb;
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => get('/__gerar?nome=' + encodeURIComponent(nome) + (perfil ? '&perfil=' + perfil : ''));
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) falhas++; };
const APP = 'https://evilasionogueiraagro-netizen.github.io/GDV/';

(async () => {
  /* ================= servidor ================= */
  console.log('1. Servidor');
  const adm = await gerar('Gestor Painel', 'admin');
  const TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  ok(TOK && TOK.length >= 32, 'credencial de administrador');
  const fisMenu = await gerar('Fiscal Menu Silva');                                     // gerado pelo menu da planilha
  const TOKFIS = (await post({ action: 'ativar', codigo: fisMenu.codigo })).token;
  ok(!!TOKFIS, 'fiscal ativado (código gerado pelo menu)');

  let d = await post({ action: 'painelGerarCodigo', key: TOKFIS, nome: 'Outro Fiscal' });
  ok(!d.ok && /Acesso restrito ao administrador/.test(d.erro), 'fiscal não gera código', d.erro);
  d = await post({ action: 'painelAcessos', key: TOKFIS }); ok(!d.ok && /Acesso restrito/.test(d.erro), 'fiscal não lista acessos', d.erro);
  d = await post({ action: 'painelRevogar', key: TOKFIS, nome: 'Fiscal Menu Silva' }); ok(!d.ok && /Acesso restrito/.test(d.erro), 'fiscal não revoga', d.erro);
  d = await post({ action: 'painelGerarCodigo', key: 'xyz', nome: 'Ana Souza' }); ok(!d.ok && /Sessão do painel inválida/.test(d.erro), 'token inválido recusado', d.erro);

  for (const [nome, re, msg] of [['', /nome completo/, 'vazio'], ['   Maria   ', /nome e sobrenome/, 'só um nome'], ['=HYPERLINK("x") Silva', /só letras/, 'fórmula'],
    ['+55 Silva', /só letras/, 'começa com +'], ['Ana 2 Souza', /só letras/, 'com número'], ['Ana ' + 'x'.repeat(90), /longo demais/, '> 80 caracteres'], ['Ana <b>Souza</b>', /só letras/, 'HTML']]) {
    d = await post({ action: 'painelGerarCodigo', key: TOK, nome }); ok(!d.ok && re.test(d.erro), 'nome inválido recusado: ' + msg, d.erro);
  }
  d = await post({ action: 'painelGerarCodigo', key: TOK, nome: '  João   da  Silva-Pereira  ' });
  ok(d.ok && d.nome === 'João da Silva-Pereira' && /^\d{6}$/.test(d.codigo) && d.expiraEm > Date.now() + 6.9 * 864e5 && d.expiraEm < Date.now() + 7.1 * 864e5, 'admin gera código (espaços normalizados, 7 dias)', d);
  ok(Object.keys(d).sort().join() === 'codigo,expiraEm,nome,ok', 'resposta só com {ok, nome, codigo, expiraEm}', Object.keys(d));
  const G = d;
  d = await post({ action: 'painelGerarCodigo', key: 'segredo', nome: "Ana D'Ávila" }); ok(d.ok, 'chave mestra (ACCESS_KEY) também gera; apóstrofo e acento aceitos', d.erro);
  const venc = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Vencido Costa' });
  await fetch(API + '/__expirar?codigo=' + venc.codigo);
  const aba = await get('/__aba?nome=Fiscais');
  ok(aba[0].join() === 'nome,codigo,expiraEm,ativo,token,ativadoEm,perfil,geradoPor', 'coluna geradoPor acrescentada no fim da aba Fiscais', aba[0]);
  const linha = n => aba.find(r => r[0] === n);
  ok(linha('João da Silva-Pereira')[7] === 'Gestor Painel' && linha("Ana D'Ávila")[7] === 'Administrador', 'geradoPor = nome do administrador', [linha('João da Silva-Pereira')[7], linha("Ana D'Ávila")[7]]);
  ok(linha('Fiscal Menu Silva')[7] === 'planilha' && linha('Gestor Painel')[7] === 'planilha', 'geradoPor = "planilha" quando veio do menu (fiscal e admin)');
  ok(linha('João da Silva-Pereira')[6] === '', 'código gerado no painel é de FISCAL (perfil vazio)');

  // lista antes da ativação
  d = await post({ action: 'painelAcessos', key: TOK });
  ok(d.ok && Array.isArray(d.acessos), 'painelAcessos responde', d.erro);
  const txt = JSON.stringify(d);
  ok(!txt.includes(TOK) && !txt.includes(TOKFIS) && !txt.includes('tok-antigo') && !/"token"/.test(txt), 'lista nunca devolve token');
  const ach = (n, l = d.acessos) => l.filter(a => a.nome === n);
  const j1 = ach('João da Silva-Pereira')[0];
  ok(j1 && j1.situacao === 'aguardando' && j1.codigo === G.codigo && j1.geradoPor === 'Gestor Painel' && j1.expiraEm === G.expiraEm && Math.abs(j1.criadoEm - (G.expiraEm - 7 * 864e5)) < 5,
    'aguardando ativação: código visível, datas e geradoPor', j1);
  const fm = ach('Fiscal Menu Silva')[0];
  ok(fm && fm.situacao === 'ativo' && !('codigo' in fm) && fm.ativadoEm > 0 && fm.geradoPor === 'planilha', 'ativo: sem código, com ativadoEm', fm);
  const vc = ach('Vencido Costa')[0]; ok(vc && vc.situacao === 'vencido' && !('codigo' in vc), 'código vencido: situação e sem código', vc);
  const ad = ach('Gestor Painel')[0]; ok(ad && ad.perfil === 'admin' && ad.situacao === 'ativo' && Object.keys(ad).sort().join() === 'nome,perfil,situacao', 'administrador só com nome/perfil/situação', ad);
  const af = ach('Antigo Fiscal')[0]; ok(af && af.situacao === 'ativo' && af.perfil === 'fiscal', 'fiscal antigo (linha sem perfil/geradoPor) aparece como ativo', af);

  // o código gerado no painel ativa um aparelho de fiscal de verdade
  d = await post({ action: 'painelAtivar', codigo: G.codigo }); ok(!d.ok && /FISCAL/.test(d.erro), 'código do painel NÃO entra no painel (é de fiscal)', d.erro);
  d = await post({ action: 'ativar', codigo: G.codigo.slice(0, 3) + ' ' + G.codigo.slice(3) });
  ok(d.ok && d.nome === 'João da Silva-Pereira' && d.token, 'código gerado no painel ativa o aparelho do fiscal (action ativar)', d.nome);
  const TOKJ = d.token;
  d = await post({ action: 'sync', key: TOKJ, since: 0 }); ok(d.ok, 'aparelho ativado sincroniza');
  d = await post({ action: 'painelAcessos', key: TOK });
  const j2 = ach('João da Silva-Pereira', d.acessos)[0];
  ok(j2.situacao === 'ativo' && !('codigo' in j2) && j2.ativadoEm > 0 && !JSON.stringify(d).includes(G.codigo + '"'), 'após ativado: código some da lista, situação ativo', j2);
  d = await post({ action: 'painelDados', key: TOKJ }); ok(!d.ok && /restrito/.test(d.erro), 'credencial do fiscal ativado pelo painel não lê o painel');

  // revogar
  const seg = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'João da Silva-Pereira' });   // 2º aparelho, ainda não usado
  d = await post({ action: 'painelRevogar', key: TOK, nome: '  joão  da silva-pereira ' });
  ok(d.ok && d.revogados === 2, 'revoga todos os acessos do fiscal (aparelho + código pendente; nome sem diferenciar maiúsculas/espaços)', d);
  d = await post({ action: 'sync', key: TOKJ, since: 0 }); ok(!d.ok && /revogado/i.test(d.erro), 'aparelho revogado: sync responde "Acesso revogado"', d.erro);
  d = await post({ action: 'ativar', codigo: seg.codigo }); ok(!d.ok && /revogado/.test(d.erro), 'código pendente revogado não ativa mais', d.erro);
  d = await post({ action: 'painelAcessos', key: TOK });
  ok(ach('João da Silva-Pereira', d.acessos).every(a => a.situacao === 'revogado' && !('codigo' in a)), 'lista: revogados, sem código', ach('João da Silva-Pereira', d.acessos).map(a => a.situacao));
  d = await post({ action: 'painelRevogar', key: TOK, nome: 'Gestor Painel' });
  ok(!d.ok && /administrador não é retirado pelo painel/.test(d.erro) && !/revogad/i.test(d.erro), 'não revoga administrador pelo painel (mensagem não derruba a sessão do painel)', d.erro);
  d = await post({ action: 'painelDados', key: TOK }); ok(d.ok, 'administrador continua ativo');
  d = await post({ action: 'painelRevogar', key: TOK, nome: 'Ninguém Existe' }); ok(d.ok && d.revogados === 0, 'nome sem acesso: 0 revogados', d);
  d = await post({ action: 'painelRevogar', key: TOK, nome: '' }); ok(!d.ok, 'nome vazio recusado', d.erro);
  // nome igual em fiscal e admin: painel só tira o de fiscal
  await gerar('Dupla Função', 'admin'); const df = await post({ action: 'painelGerarCodigo', key: TOK, nome: 'Dupla Função' });
  d = await post({ action: 'painelRevogar', key: TOK, nome: 'Dupla Função' }); ok(d.ok && d.revogados === 1, 'mesmo nome em fiscal e admin: só o de fiscal é revogado', d);
  const aba2 = await get('/__aba?nome=Fiscais'); const dup = aba2.filter(r => r[0] === 'Dupla Função');
  ok(dup.find(r => r[6] === 'admin')[3] === 1 && dup.find(r => r[6] === '')[3] === 0, 'linha de admin continua ativa', dup.map(r => [r[6], r[3]]));
  void df;
  // o menu da planilha continua funcionando (revogar_ sem restrição)
  const rv = await fetch(API + '/__revogar?nome=' + encodeURIComponent('Dupla Função')).then(r => r.text()); ok(rv === '1', 'revogar_ do menu continua revogando administrador', rv);

  /* ================= painel (Playwright) ================= */
  console.log('2. Painel');
  // dados mínimos para o painel abrir
  const hoje = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), ag = Date.now();
  await post({ action: 'sync', key: 'segredo', since: 0, turnos: [{ id: 'ac1', numeroTF: 'X', data: hoje, letra: 'A', inicio: '06:00', fim: '', fiscal: 'Fiscal Menu Silva', local: 'Barreira Porto CEASA', unidade: 'MANAUS', posto: 'Fixa', encerrado: 0, criadoEm: ag, atualizadoEm: ag, latIni: '-3.1', lngIni: '-60.0' }] });
  const adm2 = await gerar('Gerente Web', 'admin');
  const b = await amb.lancar();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const erros = [];
  async function abrir(opts = {}, init = {}, url = WEB) {
    const c = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block', ...opts });
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await c.addInitScript(i => {
      if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', 1); localStorage.setItem('gdv.url', window.__GDV_API); Object.entries(i).forEach(([k, v]) => localStorage.setItem(k, v)); }
      window.__copiado = null;   // clipboard falso
      Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get() { return { writeText: async t => { window.__copiado = t; } }; } });
      window.__abertos = []; const wo = window.open; window.open = function (u) { window.__abertos.push(u); return null; }; void wo;
    }, init);
    const p = await c.newPage(); p.erros = []; p.dialogos = [];
    p.on('pageerror', e => { p.erros.push('pageerror: ' + e.message); erros.push(e.message); });
    p.on('console', m => { if (m.type() === 'error') { p.erros.push(m.text()); erros.push(m.text()); } });
    p.on('response', rs => { if (rs.status() >= 400) erros.push(rs.status() + ' ' + rs.url()); });
    p.on('dialog', d => { p.dialogos.push(d.message()); d.accept(); });
    await p.goto(url); return p;
  }
  const esperarDados = p => p.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 20000 }).then(() => p.waitForTimeout(300));
  const irAba = async (p, id) => { await p.click(`.pn-aba[data-aba=${id}]`); await p.waitForFunction(i => document.querySelector(`.pn-aba[data-aba=${i}]`).getAttribute('aria-selected') === 'true', id); await p.waitForTimeout(300); };
  const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const esperarLista = p => p.waitForSelector('#pn-ac-tab table, #pn-ac-tab .pn-vazio:not(:has-text("Carregando"))', { timeout: 15000 });
  const linhasTab = p => p.$$eval('#pn-ac-tab tbody tr', trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));

  let p = await abrir();
  await p.fill('#pn-codigo', adm2.codigo); await p.click('#pn-entrar'); await esperarDados(p);
  const abas = await p.$$eval('.pn-aba', a => a.map(x => x.dataset.aba + ':' + x.textContent.trim()));
  ok(abas.join() === 'geral:Visão geral,barreiras:Barreiras,tf:TF de Barreira,pce:PCE,acessos:Servidores', 'aba "Servidores" depois do PCE', abas);
  await irAba(p, 'acessos'); await esperarLista(p);
  ok(await p.isHidden('.pn-filtros'), 'filtros de período escondidos na aba Servidores');
  ok(await p.isVisible('#pn-ac-form') && await p.isHidden('#pn-ac-res'), 'formulário visível; sem código ainda');
  let L = await linhasTab(p);
  ok(L.some(r => r[0] === 'Fiscal Menu Silva' && r[1] === 'Ativo' && /Planilha/.test(r[11])), 'tabela: fiscal ativo gerado pela planilha', L.find(r => r[0] === 'Fiscal Menu Silva'));
  ok(!L.some(r => /administrador/.test(r[0])), 'administradores ocultos por padrão');

  // validação no cliente
  await p.fill('#pn-ac-nome', 'Maria'); await p.click('#pn-ac-gerar');
  ok(/nome e sobrenome/.test(await p.textContent('#pn-ac-erro')) && await p.isVisible('#pn-ac-erro'), 'só um nome: aviso no formulário');
  await p.fill('#pn-ac-nome', 'Maria 9 Souza'); await p.click('#pn-ac-gerar');
  await p.waitForFunction(() => /só letras/.test(document.querySelector('#pn-ac-erro').textContent));
  ok(true, 'nome com número: mensagem do servidor no formulário');
  ok(await p.isVisible('#pn-app') && await p.evaluate(() => !!localStorage.getItem('gdv.painel.token')), 'erro de validação não derruba a sessão');

  // gerar
  await p.fill('#pn-ac-nome', '  Carla   Mendes Rocha '); await p.click('#pn-ac-gerar');
  await p.waitForSelector('#pn-ac-res:not([hidden]) #pn-ac-codigo');
  const cod = (await p.textContent('#pn-ac-codigo')).trim();
  ok(/^\d{3} \d{3}$/.test(cod), 'código grande no formato "123 456"', cod);
  const res = await p.textContent('#pn-ac-res');
  ok(/Carla Mendes Rocha/.test(res) && /válida até \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(res) && /Manaus/.test(res), 'nome, validade (data/hora de Manaus)', res.replace(/\s+/g, ' ').slice(0, 160));
  ok(/Instale o app/.test(res) && /digite o código/.test(res) && await p.getAttribute('#pn-ac-res a[href]', 'href') === APP, 'instruções e link do app');
  ok(await p.inputValue('#pn-ac-nome') === '', 'campo limpo após gerar');
  const lin = (await get('/__aba?nome=Fiscais')).find(r => r[0] === 'Carla Mendes Rocha');
  ok(lin && lin[1] === cod.replace(' ', '') && lin[7] === 'Gerente Web' && lin[6] === '', 'planilha: código de fiscal com geradoPor = administrador logado', lin && [lin[1], lin[6], lin[7]]);
  await p.waitForFunction(() => [...document.querySelectorAll('#pn-ac-tab tbody tr')].some(tr => tr.cells[0].textContent.includes('Carla Mendes Rocha')));
  L = await linhasTab(p);
  const lc = L.find(r => r[0] === 'Carla Mendes Rocha');
  ok(lc && lc[1] === 'Aguardando ativação' && lc[7].startsWith(cod) && lc[11] === 'Gerente Web', 'lista atualizada após gerar (aguardando, código, gerado por)', lc);

  // copiar e WhatsApp
  await p.click('#pn-ac-copiar'); await p.waitForFunction(() => window.__copiado);
  const msg = await p.evaluate(() => window.__copiado);
  ok(msg.includes(APP) && msg.includes(cod) && /válida até \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(msg) && /Olá, Carla!/.test(msg) && msg.includes('Carla Mendes Rocha'), 'mensagem copiada: link, código, validade e nome', msg);
  ok(/copiada/i.test(await p.textContent('#pn-ac-aviso')), 'aviso "Mensagem copiada"');
  const wa = await p.getAttribute('#pn-ac-whats', 'href');
  ok(wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa.slice('https://wa.me/?text='.length)) === msg, 'link do WhatsApp = wa.me/?text= + mesma mensagem', wa.slice(0, 80));
  ok(await p.getAttribute('#pn-ac-whats', 'target') === '_blank' && /noopener/.test(await p.getAttribute('#pn-ac-whats', 'rel')), 'WhatsApp abre em nova aba (noopener)');

  // atualização automática do painel não apaga o código mostrado
  await p.evaluate(() => Painel.recarregar()); await p.waitForTimeout(1200);
  ok((await p.textContent('#pn-ac-codigo').catch(() => '')).trim() === cod, 'código continua na tela após atualização do painel');

  await p.setViewportSize({ width: 1366, height: 900 }); await p.screenshot({ path: amb.saida('acessos_desktop.png'), fullPage: true });

  // filtros
  await p.selectOption('#pn-ac-sit', 'aguardando'); L = await linhasTab(p);
  ok(L.length >= 1 && L.every(r => r[1] === 'Aguardando ativação'), 'filtro por situação', L.map(r => r[0]));
  await p.selectOption('#pn-ac-sit', ''); await p.fill('#pn-ac-busca', 'carla'); await p.waitForTimeout(100); L = await linhasTab(p);
  ok(L.length === 1 && L[0][0] === 'Carla Mendes Rocha', 'busca por nome (sem diferenciar maiúsculas)', L.map(r => r[0]));
  await p.fill('#pn-ac-busca', ''); await p.check('#pn-ac-admins'); await p.waitForTimeout(100); L = await linhasTab(p);
  const la = L.find(r => r[0].startsWith('Gerente Web'));
  ok(la && /administrador/.test(la[0]) && la[7] === '—' && /só pela planilha/.test(la[12]), 'administradores (opcional): sem código e sem botão Revogar', la);
  await p.uncheck('#pn-ac-admins');

  // reenviar
  await p.evaluate(() => { const r = document.querySelector('#pn-ac-res'); r.hidden = true; });
  await p.click('#pn-ac-tab button[data-acao=reenviar]'); ok(await p.isVisible('#pn-ac-res') && (await p.textContent('#pn-ac-codigo')).trim() === cod, 'Reenviar monta a mensagem do código pendente');

  // ativar no app com o código e ver a lista mudar
  const at = await post({ action: 'ativar', codigo: cod });
  ok(at.ok && at.nome === 'Carla Mendes Rocha', 'código do painel ativa o aparelho');
  await p.click('#pn-ac-recarregar'); await p.waitForTimeout(800); L = await linhasTab(p);
  const lc2 = L.find(r => r[0] === 'Carla Mendes Rocha');
  ok(lc2 && lc2[1] === 'Ativo' && lc2[7] === '—' && /\d{2}\/\d{2}\/\d{4}/.test(lc2[10]), 'após ativar: "Ativo", sem código, com data de ativação', lc2);

  // revogar com confirmação
  p.dialogos = [];
  await p.click('#pn-ac-tab tr:has-text("Carla Mendes Rocha") button[data-acao=revogar]');
  await p.waitForFunction(() => [...document.querySelectorAll('#pn-ac-tab tbody tr')].some(tr => tr.cells[0].textContent.includes('Carla Mendes Rocha') && tr.cells[1].textContent.includes('Revogado')), null, { timeout: 10000 });
  ok(p.dialogos.length === 1 && /Revogar o acesso de Carla Mendes Rocha/.test(p.dialogos[0]), 'confirmação antes de revogar', p.dialogos);
  const sy = await post({ action: 'sync', key: at.token, since: 0 }); ok(!sy.ok && /revogado/i.test(sy.erro), 'aparelho revogado pelo painel: sync recusado', sy.erro);
  ok(/revogado \(1 aparelho/.test(await p.textContent('#pn-ac-tab')), 'aviso de quantos foram revogados');
  ok(!(await p.$('#pn-ac-tab tr:has-text("Carla Mendes Rocha") button[data-acao=revogar]')), 'revogado: sem botão Revogar');
  // cancelar a confirmação não revoga
  const ped = await post({ action: 'painelGerarCodigo', key: 'segredo', nome: 'Pedro Cancela Lima' }); void ped;
  await p.click('#pn-ac-recarregar'); await p.waitForSelector('#pn-ac-tab tr:has-text("Pedro Cancela Lima")');
  p.removeAllListeners('dialog'); p.once('dialog', d => d.dismiss());
  await p.click('#pn-ac-tab tr:has-text("Pedro Cancela Lima") button[data-acao=revogar]'); await p.waitForTimeout(600);
  ok((await get('/__aba?nome=Fiscais')).find(r => r[0] === 'Pedro Cancela Lima')[3] === 1, 'cancelar a confirmação não revoga');
  p.on('dialog', d => { p.dialogos.push(d.message()); d.accept(); });
  ok(await p.isVisible('#pn-app'), 'sessão do painel intacta após revogar');

  // escuro
  const tok = await p.evaluate(() => localStorage.getItem('gdv.painel.token'));
  const sess = { 'gdv.painel.token': tok, 'gdv.painel.nome': 'Gerente Web', 'gdv.painel.aba': 'acessos' };
  const pe = await abrir({ colorScheme: 'dark' }, sess);
  await pe.waitForSelector('.pn-aba[data-aba=acessos][aria-selected=true]', { timeout: 20000 }); await esperarLista(pe);
  ok(await pe.isVisible('#pn-ac-form'), 'aba lembrada ao recarregar');
  await pe.fill('#pn-ac-nome', 'Escuro Teste Lima'); await pe.click('#pn-ac-gerar'); await pe.waitForSelector('#pn-ac-res:not([hidden])'); await pe.waitForTimeout(500);
  const cores = await pe.evaluate(() => ({ fundo: getComputedStyle(document.body).backgroundColor, cod: getComputedStyle(document.querySelector('#pn-ac-codigo')).color }));
  const lum = s => s.match(/\d+/g).slice(0, 3).map(Number).reduce((a, c) => a + c, 0) / 3;
  ok(lum(cores.fundo) < 60 && lum(cores.cod) > 180, 'modo escuro: fundo escuro, código claro', cores);
  await pe.screenshot({ path: amb.saida('acessos_escuro.png'), fullPage: true });

  // celular
  const pc = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { 'gdv.painel.token': tok, 'gdv.painel.nome': 'Gerente Web' });
  await esperarDados(pc);
  const abasCel = await pc.$$eval('.pn-aba', a => a.map(x => { const r = x.getBoundingClientRect(); return r.right <= innerWidth + 0.5 && r.left >= 0; }));
  ok(abasCel.length === 5 && abasCel.every(Boolean), '390 px: cinco abas inteiras', abasCel);
  await irAba(pc, 'acessos'); await esperarLista(pc);
  ok(await semRolagem(pc), '390 px sem rolagem horizontal (antes de gerar)');
  await pc.fill('#pn-ac-nome', 'Celular Teste Souza'); await pc.click('#pn-ac-gerar'); await pc.waitForSelector('#pn-ac-res:not([hidden])'); await pc.waitForTimeout(600);
  ok(await semRolagem(pc), '390 px sem rolagem horizontal (com código e tabela)');
  const cx = await pc.evaluate(() => { const r = document.querySelector('#pn-ac-codigo').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, fs: parseFloat(getComputedStyle(document.querySelector('#pn-ac-codigo')).fontSize) }; });
  ok(cx.l >= 0 && cx.r <= cx.w && cx.fs >= 40, 'código grande inteiro na tela do celular', cx);
  const vis = await pc.evaluate(() => { const t = document.querySelector('#pn-ac-tab table'), r = document.querySelector('#pn-ac-tab .pn-tab-rolo'); const bt = document.querySelector('#pn-ac-tab button[data-acao=revogar]').getBoundingClientRect();
    return { semRoloInterno: r.scrollWidth <= r.clientWidth + 1, revogarNaTela: bt.right <= innerWidth, th: [...t.querySelectorAll('th')].filter(x => x.offsetParent).map(x => x.textContent) }; });
  ok(vis.semRoloInterno && vis.revogarNaTela && vis.th.join() === 'Servidor,Situação,Módulos,Código,', '390 px: tabela cabe (Servidor, Situação, Módulos, Código, Revogar) sem rolagem interna', vis);
  await pc.screenshot({ path: amb.saida('acessos_celular.png'), fullPage: true });

  // Modo TV
  console.log('3. Modo TV');
  const pt = await abrir({ viewport: { width: 1920, height: 1080 } }, { 'gdv.painel.token': tok, 'gdv.painel.nome': 'Gerente Web', 'gdv.painel.aba': 'acessos' }, WEB + '?tv=1&rotacao=300&rotacaoAoVivo=300');
  const reqs = []; pt.on('request', rq => { if (rq.method() === 'POST' && rq.url().startsWith(amb.API)) reqs.push(rq.postData() || ''); });
  await pt.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 }); await pt.waitForTimeout(1500);
  const tv = await pt.evaluate(() => ({ visAba: [...document.querySelectorAll('.pn-aba')].some(e => e.offsetParent !== null), form: !!document.querySelector('#pn-ac-form'), txt: document.getElementById('tv-raiz').innerText,
    botoes: [...document.querySelectorAll('#tv-raiz button')].map(b => b.textContent.trim()) }));
  ok(!tv.visAba && !tv.form, 'Modo TV: aba Servidores ausente (sem abas, sem formulário) mesmo com a aba lembrada', tv);
  ok(!/Servidores|chave de ativa/i.test(tv.txt) && !tv.botoes.some(t => /Servidor|Revogar|Gerar/.test(t)), 'Modo TV: nada de Servidores na tela nem nos botões', tv.botoes);
  const telas = await pt.evaluate(() => PainelTV.opcoes.telas).catch(() => null);
  ok(Array.isArray(telas) && telas.length && !telas.includes('acessos'), 'Modo TV: Servidores fora da rotação', telas);
  const pt2 = await abrir({ viewport: { width: 1920, height: 1080 } }, { 'gdv.painel.token': tok, 'gdv.painel.nome': 'Gerente Web' }, WEB + '?tv=1&telas=acessos,aovivo');
  await pt2.waitForSelector('#tv-palco .tv-kpi', { timeout: 20000 });
  const telas2 = await pt2.evaluate(() => PainelTV.opcoes.telas);
  ok(!telas2.includes('acessos'), '?telas=acessos é ignorado no Modo TV', telas2);
  ok(!reqs.some(r => /painelAcessos|painelGerarCodigo/.test(r)), 'Modo TV não chama painelAcessos', reqs.map(r => r.slice(0, 40)));

  const errs = [...new Set(erros)];
  ok(!errs.length, 'sem erros de console/página/HTTP', errs);
  await b.close();
  console.log(falhas ? 'FALHOU=' + falhas : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('FALHOU=1', e.stack); process.exit(1); });
