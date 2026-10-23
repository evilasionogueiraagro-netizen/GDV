const amb = require('./lib/amb');
// Portal do Administrativo (web/administrativo/ + actions adm* do Code.gs real via fakegas), com matrícula e senha (permissão
// `administracao`, token em `sessao`): entrada com `entrar` (aplicativo administracao), senha errada, bloqueio após 10 recusas, conta só
// do painel ou do campo recusada, gerência entra, sessão guardada só como hash, sair, desativar e reativar; a sessão do portal não vale
// no painel nem no app (e vice-versa); desembolso (saldo ao vivo, memorando repetido, diária acima do previsto, data fora da vigência,
// servidor da lista — nome só no portal/planilha), importação pela action do portal, lançamentos físicos e linhas manuais de relatório
// com histórico e quem lançou (nome e id do usuário); o painel não tem mais formulários de lançamento e as actions antigas de gravação
// recusam; nomes de servidores não aparecem nas respostas do painel nem no relatório; tela do portal (desembolso, físico, linhas dos
// relatórios, histórico, celular claro/escuro) e a leitura dos lançamentos no painel. Sai o mecanismo de código de ativação (gerar,
// ativar, painelAdm*, admCodigo, admLogin, lista de liberados e remover/restaurar): não existe mais, e a gestão de contas, o bloqueio
// de login e as sessões estão em usuarios_server_test.js e login_painel_test.js.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { API } = amb;
const PORTAL = require('./lib/portal');
const LOGIN = require('./lib/login');
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700))); if (!c) falhas++; };
const SAIDA = process.env.GDV_SAIDA_ADM || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const shot = async (p, nome, full = true) => { await p.screenshot({ path: amb.saida('adm_' + nome + '.png'), fullPage: full }); if (SAIDA) fs.copyFileSync(amb.saida('adm_' + nome + '.png'), path.join(SAIDA, nome + '.png')); };
const SRV = 'Servidora Diarista Secreta';      // nome de servidor das diárias: só no portal e na planilha

(async () => {
  /* ================= 1. contas do portal (matrícula e senha) ================= */
  console.log('1. Contas do Portal do Administrativo (matrícula e senha, permissão administracao)');
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');
  const GER = await LOGIN.criar('Gerente Portal', { permissoes: ['gerencia'] });        // gerência: vale no painel e no portal
  const TOK = GER.token;
  const ANA = await LOGIN.portal('Ana Souza Administrativa', { matricula: 'ana.souza' });
  const BIA = await LOGIN.portal('Bia Lima Administrativa', { matricula: 'bia.lima' });
  const CAIO = await LOGIN.portal('Caio Reis Administrativo', { matricula: 'caio.reis' });
  const SO_PAINEL = await LOGIN.soLeitura('Leitura Teste Painel', { matricula: 'leitura.teste' });
  const FIS = await LOGIN.campo('Fiscal Campo Teste', { matricula: 'fiscal.teste' });
  ok(ANA.token && BIA.token && CAIO.token && ANA.permissoes.includes('administracao'), 'contas do portal criadas: a primeira entrada troca a senha provisória e entra com matrícula e senha', ANA.permissoes);
  let r = await post({ action: 'admDados', sessao: SO_PAINEL.token });
  ok(!r.ok && /não inclui o Portal do Administrativo/.test(r.erro), 'quem só tem painel (ver) não entra no portal', r.erro);
  r = await post({ action: 'admDados', sessao: FIS.token });
  ok(!r.ok && /não inclui o Portal do Administrativo/.test(r.erro), 'conta só do campo não entra no portal', r.erro);
  r = await post({ action: 'admDados', sessao: TOK });
  ok(r.ok && r.nome === 'Gerente Portal', 'gerência entra no portal (gerencia vale todas as permissões)', r.erro);
  r = await post({ action: 'admDados' });
  ok(!r.ok && /Entre com sua matrícula e senha/.test(r.erro), 'sem sessão: recusado', r.erro);
  r = await post({ action: 'admDados', sessao: 'segredo' });
  ok(!r.ok && /Sessão do portal encerrada/.test(r.erro), 'chave mestra (ACCESS_KEY) não vale no portal', r.erro);
  r = await post({ action: 'admCodigo', codigo: '123456' });
  ok(!r.ok && /Ação inválida/.test(r.erro), 'admCodigo não existe mais (entrada só por matrícula e senha)', r.erro);

  /* ================= 2. entrada, senha errada, bloqueio e sessão guardada como hash ================= */
  console.log('2. Entrada com matrícula e senha, bloqueio e sessão');
  r = await post({ action: 'entrar', matricula: 'ana.souza', senha: 'Senha-errada-9', aplicativo: 'administracao' });
  ok(!r.ok && /Matrícula ou senha incorreta/.test(r.erro), 'senha errada recusada (mensagem única)', r.erro);
  r = await post({ action: 'entrar', matricula: 'ana.souza', senha: LOGIN.SENHA, aplicativo: 'painel' });
  ok(!r.ok && /não inclui o painel/.test(r.erro), 'conta só do portal não entra no painel', r.erro);
  r = await post({ action: 'entrar', matricula: 'ana.souza', senha: LOGIN.SENHA, aplicativo: 'administracao' });
  ok(r.ok && r.token && r.usuario.nome === 'Ana Souza Administrativa', 'entrar de novo com matrícula e senha abre outra sessão do portal', r.erro);
  const ANA2 = r.token;
  let tudo = JSON.stringify(await get('/__tudo'));
  const hash = t => crypto.createHash('sha256').update(t).digest('hex');
  ok(!tudo.includes(ANA.token) && !tudo.includes(ANA2) && tudo.includes(hash(ANA.token)), 'planilha: a sessão não fica em claro (só o SHA-256 em SessoesDosUsuarios)');
  // bloqueio: 10 recusas por matrícula em 15 min (Caio, só para isto)
  for (let i = 0; i < 10; i++) await post({ action: 'entrar', matricula: 'caio.reis', senha: 'Senha-errada-9', aplicativo: 'administracao' });
  r = await post({ action: 'entrar', matricula: 'caio.reis', senha: LOGIN.SENHA, aplicativo: 'administracao' });
  ok(!r.ok && /Muitas tentativas/.test(r.erro), 'depois de 10 recusas, até a senha certa fica bloqueada (15 min)', r.erro);

  /* ================= 3. isolamento, sair e desativar ================= */
  console.log('3. Isolamento entre painel, app e portal; sair; desativar');
  r = await post({ action: 'painelConvenios', key: ANA.token }); ok(!r.ok && /não inclui o painel/.test(r.erro), 'sessão do portal não vale no painel', r.erro);
  r = await post({ action: 'sync', key: ANA.token, since: 0 }); ok(!r.ok && /não inclui o app de campo/.test(r.erro), 'sessão do portal não vale no app de campo', r.erro);
  r = await post({ action: 'painelConvFinLancar', key: ANA.token, lancamento: {} }); ok(!r.ok, 'sessão do portal não lança pelo painel', r.erro);
  r = await post({ action: 'admSair', sessao: ANA2 }); ok(r.ok, 'sair do portal');
  r = await post({ action: 'admDados', sessao: ANA2 }); ok(!r.ok && /Sessão do portal encerrada/.test(r.erro), 'depois de sair, a sessão não vale mais', r.erro);
  r = await post({ action: 'admDados', sessao: ANA.token }); ok(r.ok, 'a outra sessão da Ana continua valendo');
  // desativar: a gerência encerra as sessões; reativar: volta a entrar com a senha
  r = await post({ action: 'usuarioAtivar', key: TOK, usuarioId: BIA.id, ativo: 0 }); ok(r.ok, 'gerência desativa a Bia');
  r = await post({ action: 'admDados', sessao: BIA.token }); ok(!r.ok && /Sessão do portal encerrada/.test(r.erro), 'desativada: a sessão cai na próxima chamada', r.erro);
  r = await post({ action: 'entrar', matricula: 'bia.lima', senha: LOGIN.SENHA, aplicativo: 'administracao' }); ok(!r.ok && /Acesso desativado/.test(r.erro), 'desativada: não entra com a senha', r.erro);
  r = await post({ action: 'usuarioAtivar', key: TOK, usuarioId: BIA.id, ativo: 1 }); ok(r.ok, 'gerência reativa a Bia');
  r = await post({ action: 'entrar', matricula: 'bia.lima', senha: LOGIN.SENHA, aplicativo: 'administracao' }); ok(r.ok, 'reativada: entra de novo com a mesma senha');
  BIA.token = r.token;

  /* ================= 4. lançamentos pelo portal ================= */
  console.log('4. Desembolso, físico, linhas de relatório e histórico');
  const S = ANA.token, NA = ANA.nome, D = await post({ action: 'admDados', sessao: S });
  ok(D.ok && D.nome === NA && Array.isArray(D.servidores) && !D.servidores.length, 'admDados: sugestões de servidores começam vazias (vêm dos lançamentos; não são os fiscais)', D.servidores);
  const FL = l => post({ action: 'admConvFinLancar', sessao: S, lancamento: { convenio: '991272-2025', ...l } });
  let f = await FL({ etapa: '1.4', item: '1.4.3', data: '2026-09-10', valor: 1200, quantidade: 10, tipoDiaria: 'NM', servidorNome: '  ' + SRV + '  ', documento: 'Memo nº 100/2026', descricao: 'Diárias levantamento' });
  ok(f.ok && f.lancamento.servidorNome === SRV && /^srv-[0-9a-f]{12}$/.test(f.lancamento.servidorId) && f.lancamento.usuario === NA && !f.avisos.length, 'desembolso com servidor digitado livremente (nome normalizado, id estável) e quem lançou', f);
  const ID_FIN = f.lancamento.id;
  const D2 = await post({ action: 'admDados', sessao: S }), srv = D2.servidores.find(x => x.nome === SRV);
  ok(srv && srv.id === f.lancamento.servidorId, 'o nome lançado passa a ser sugerido no autopreenchimento', D2.servidores);
  f = await FL({ etapa: '1.4', item: '1.4.3', data: '2026-09-11', valor: 120, quantidade: 1, tipoDiaria: 'NM', documento: 'memo 100/2026' });
  ok(f.ok && f.avisos.some(a => /já lançado/.test(a)), 'aviso: memorando repetido no mesmo item (não bloqueia)', f.avisos);
  f = await FL({ etapa: '1.14', item: '1.14.3', data: '2026-09-11', valor: 1920, quantidade: 16, tipoDiaria: 'NM' });
  ok(f.ok && f.avisos.some(a => /acima do previsto/.test(a)), 'aviso: diárias acima do previsto no item (16 de 15)', f.avisos);
  f = await FL({ etapa: '1.4', item: '1.4.3', data: '2027-09-11', valor: 120 }); ok(!f.ok && /fora da vigência/.test(f.erro), 'data fora da vigência recusada', f.erro);
  f = await FL({ etapa: '1.4', item: '1.4.3', data: '2026-09-11', valor: 120, servidorNome: 'Fulano 123.456.789-09' }); ok(!f.ok && /CPF/.test(f.erro), 'servidor com CPF no nome recusado (LGPD)', f.erro);
  f = await FL({ etapa: '1.4', item: '1.4.3', data: '2026-09-11', valor: 120, tipoDiaria: 'XX' }); ok(!f.ok && /Tipo de diária/.test(f.erro), 'tipo de diária inválido recusado', f.erro);
  // importação pela action do portal (idempotente)
  const imp = itens => post({ action: 'admConvFinImportar', sessao: S, convenio: '991272-2025', arquivo: 'MOVIMENTACAO.xlsx', itens });
  const IT = [{ chave: 'imp|991272-2025|1.10.4|90/2026', item: '1.10.4', etapa: '1.10', data: '2026-03-10', valor: 1050, documento: 'Memo nº 90/2026', quantidade: 5, fonte: 'concedente', descricao: 'Diária NM' }];
  r = await imp(IT); ok(r.ok && r.novos === 1, 'importação da planilha de movimentação pelo portal', r);
  r = await imp(IT); ok(r.ok && r.novos === 0 && r.iguais === 1, 'reimportar não duplica', r);
  // físico
  const LF = l => post({ action: 'admConvLancar', sessao: S, lancamento: { convenio: '991272-2025', ...l } });
  let lf = await LF({ etapa: '1.5', submeta: 'tabatinga', data: '2026-09-01', quantidade: 4, descricao: 'Ações de controle' });
  ok(lf.ok && lf.lancamento.usuario === NA, 'lançamento físico 1.5 pelo portal', lf);
  lf = await LF({ etapa: '1.4', data: '2026-09-01', quantidade: 2, descricao: '' }); ok(!lf.ok && /justificativa/.test(lf.erro), 'ajuste sem justificativa recusado (mesmas validações)', lf.erro);
  const lfx = await LF({ etapa: '1.14', submeta: 'tabatinga', data: '2026-09-02', quantidade: 1, descricao: 'errado' });
  r = await post({ action: 'admConvExcluir', sessao: S, id: lfx.lancamento.id }); ok(r.ok, 'exclusão lógica pelo portal');
  // linhas de relatório
  const RL = (lancamentos, ano = 2026) => post({ action: 'admRelLancar', sessao: S, ano, lancamentos });
  r = await RL([{ mes: '09', chave: 'pce.capacitacao', valor: 3 }, { mes: '09', chave: 'mun.moniliase.poda|Tabatinga', valor: 5 }, { mes: '09', chave: 'tab.cfo', lista: [{ produto: 'BANANA', documentos: 4, quantidade: 1.5, unidade: 't' }] }]);
  ok(r.ok && r.gravados === 3, 'linhas manuais do relatório gravadas pelo portal', r);
  const errosRel = [[[{ mes: '09', chave: 'pce.capacitacao', valor: 2.5 }], /decimal/], [[{ mes: '09', chave: 'pce.capacitacao', valor: -1 }], /inválido/],
    [[{ mes: '09', chave: 'vig.fixa.partidas', valor: 3 }], /VIGIFITO/], [[{ mes: '09', chave: 'tab.cfo', lista: [{ produto: 'X', documentos: 1.5 }] }], /decimal/]];
  for (const [l, re] of errosRel) { const x = await RL(l); ok(!x.ok && re.test(x.erro), `linha de relatório recusada: ${re.source}`, x.erro || x); }
  r = await RL([{ mes: '09', chave: 'pce.areaControlada', valor: 12.5 }]); ok(r.ok, 'área controlada (ha) aceita decimal');
  const H = await post({ action: 'admHistorico', sessao: S });
  ok(H.ok && H.historico.some(h => h.aba === 'ConvFinanceiro' && h.acao === 'lançar') && H.historico.some(h => h.aba === 'ConvLancamentos' && h.acao === 'excluir') &&
    H.historico.some(h => h.aba === 'RelGdvLancamentos' && h.registro === '2026|09|pce.capacitacao') && H.historico.some(h => h.acao === 'importar') && H.historico.every(h => h.nome),
    'histórico: lançar, excluir, importar e linhas de relatório, com quem', H.historico.slice(0, 3));
  ok(H.historico.some(h => h.nome === NA), 'histórico traz o nome de quem lançou');
  const cf = await get('/__aba?nome=ConvFinanceiro'), iN = cf[0].indexOf('servidorNome'), iA = cf[0].indexOf('admId');
  ok(cf.slice(1).some(l => l[iN] === SRV) && cf.slice(1).every(l => !l[iA] || l[iA] === ANA.id), 'aba ConvFinanceiro: nome do servidor e admId (id do usuário) de quem lançou (planilha)');
  const rl0 = await get('/__aba?nome=RelGdvLancamentos'), iU = rl0[0].indexOf('usuario');
  ok(rl0.slice(1).some(l => l[iU] === NA), 'aba RelGdvLancamentos: quem lançou (nome)');

  /* ================= 5. painel: só leitura nos lançamentos ================= */
  console.log('5. Painel: actions antigas recusam e nenhum nome de servidor');
  for (const [a, extra] of [['painelConvLancar', { lancamento: { convenio: '991272-2025', etapa: '1.5', submeta: 'tabatinga', data: '2026-09-01', quantidade: 1 } }],
    ['painelConvFinLancar', { lancamento: { convenio: '991272-2025', etapa: '1.4', item: '1.4.3', data: '2026-09-01', valor: 10 } }], ['painelConvFinImportar', { convenio: '991272-2025', itens: IT }],
    ['painelConvExcluir', { id: ID_FIN }], ['painelConvFinExcluir', { id: ID_FIN }], ['painelRelGdvSalvar', { ano: 2026, lancamentos: [{ mes: '09', chave: 'pce.capacitacao', valor: 9 }] }]]) {
    const x = await post({ action: a, key: TOK, ...extra }); ok(!x.ok && /Portal do Administrativo/.test(x.erro), `painel: ${a} recusa ("Lançamentos são feitos no Portal do Administrativo")`, x);
  }
  r = await post({ action: 'painelRelGdvSalvar', key: TOK, ano: 2026, tipo: 'mensal', mes: '09', textos: { introducao: 'Texto do gerente.' } }); ok(r.ok, 'painel continua salvando os TEXTOS dos relatórios');
  const PC = await post({ action: 'painelConvenios', key: TOK }), PR = await post({ action: 'painelRelGdv', key: TOK, ano: 2026 });
  ok(PC.ok && PC.financeiro.length === 4 && PC.financeiro.some(l => l.servidorNome === SRV), 'painelConvenios (só administrador): financeiro com o nome do servidor da diária', PC.financeiro[0]);
  ok(PR.ok && PR.lancamentos.some(l => l.chave === 'pce.capacitacao' && l.usuario === NA), 'painelRelGdv: lançamentos do portal com quem lançou (só leitura)');

  /* ================= 6. telas ================= */
  console.log('6. Telas do portal e do painel');
  const b = await amb.lancar();
  const SA = { sessao: S, nome: NA, email: '' };     // entra com a conta da Ana (matrícula e senha), como depois do login
  const p = await PORTAL.abrir(b, SA, { aba: 'desembolso' });
  await p.waitForSelector('#pn-conv-fin-form', { timeout: 20000 });
  ok(await p.locator('#adm-abas .pn-aba').count() >= 5, 'abas: desembolso, físico, linhas dos relatórios, VIGIFITO e histórico');
  await p.selectOption('#pn-cf-etapa', '1.4'); await p.selectOption('#pn-cf-item', '1.4.3');
  await p.fill('#pn-cf-valor', '600');
  ok(await p.inputValue('#pn-cf-qtd') === '5' && await p.inputValue('#pn-cf-tipo') === 'NM', 'diárias calculadas pelo valor ÷ valor unitário (600 ÷ 120 = 5) e tipo NM pelo item');
  const saldoDepois = Number(await p.getAttribute('[data-saldo-depois]', 'data-saldo-depois'));
  ok(saldoDepois === 22680 - 1200 - 120 - 600, 'saldo da subetapa ao vivo (previsto − executado − este)', saldoDepois);
  await p.fill('#pn-cf-doc', 'Memo nº 100/2026');
  await p.waitForSelector('#adm-fin-avisos .pn-alerta');
  ok(/já lançado nesta subetapa/.test(await p.textContent('#adm-fin-avisos')), 'aviso ao vivo: memorando repetido');
  await p.fill('#pn-cf-data', '2027-12-01');
  ok(/fora da vigência/.test(await p.textContent('#adm-fin-avisos')), 'aviso ao vivo: data fora da vigência');
  await p.fill('#pn-cf-data', '2026-09-20'); await p.fill('#pn-cf-doc', 'Memo nº 130/2026');
  ok(await p.locator('#pn-cf-srv-lista option[value="' + SRV + '"]').count() === 1, 'campo do servidor é texto livre com sugestão dos nomes já lançados');
  await p.fill('#pn-cf-srv', SRV); await p.fill('#pn-cf-mun', 'Presidente Figueiredo');
  await shot(p, 'portal_desembolso');
  await p.click('#pn-cf-salvar');
  await p.waitForFunction(() => /Lançado/.test(document.querySelector('[data-msg=fin]').textContent), null, { timeout: 15000 });
  ok((await p.textContent('#adm-tab-conv-fin-lanc')).includes(SRV), 'lista do portal mostra o nome do servidor');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#adm-tab-conv-fin-lanc [data-csv]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok(csv.includes(SRV) && /Memo nº 130\/2026/.test(csv), 'CSV do portal inclui o servidor', csv.slice(0, 200));
  const fin = await get('/__aba?nome=ConvFinanceiro'), iMun = fin[0].indexOf('municipio'), iDoc = fin[0].indexOf('documento');
  ok(iMun === fin[0].length - 1 && fin.some(l => l[iDoc] === 'Memo nº 130/2026' && l[iMun] === 'Presidente Figueiredo'), 'município do desembolso gravado (coluna municipio no fim de ConvFinanceiro)', fin[0].slice(-3));
  ok((await p.textContent('#adm-tab-conv-fin-lanc')).includes('Presidente Figueiredo') && /Presidente Figueiredo/.test(csv), 'lista e CSV do portal mostram o município');
  // físico
  await PORTAL.aba(p, 'fisico'); await p.waitForSelector('#pn-conv-lanc-form');
  await p.selectOption('#pn-cl-etapa', '1.14'); await p.selectOption('#pn-cl-sub', 'jundia'); await p.fill('#pn-cl-data', '2026-09-15'); await p.fill('#pn-cl-qtd', '1'); await p.fill('#pn-cl-desc', 'Supervisão no Jundiá');
  await p.click('#pn-cl-salvar'); await p.waitForFunction(() => /Lançado/.test(document.querySelector('[data-msg=lanc]').textContent), null, { timeout: 15000 });
  ok((await get('/__aba?nome=ConvLancamentos')).some(l => l[2] === '1.14' && l[7] === 'Supervisão no Jundiá'), 'físico lançado pela tela do portal');
  await shot(p, 'portal_fisico');
  // linhas dos relatórios
  await PORTAL.aba(p, 'relatorios'); await p.waitForSelector('#pn-rg-ano');
  await p.selectOption('#pn-rg-ano', '2026'); await p.selectOption('#pn-rg-mes', '9');
  await p.waitForSelector('.pn-rg-in[data-chave="pce.capacitacao"]');
  ok(await p.inputValue('.pn-rg-in[data-chave="pce.capacitacao"]') === '3' && new RegExp('lançado por ' + NA).test(await p.getAttribute('.pn-rg-in[data-chave="pce.capacitacao"]', 'title')), 'linhas dos relatórios: valor lançado e quem lançou');
  await p.fill('.pn-rg-in[data-chave="pce.medidaFito"]', '7');
  await p.click('[data-rg=add-linha][data-tab="tab.ptv"]');
  await p.fill('[data-tab="tab.ptv"][data-campo=produto]', 'ABACAXI'); await p.fill('[data-tab="tab.ptv"][data-campo=documentos]', '2');
  await p.click('#pn-rg-salvar'); await p.waitForFunction(() => /Gravado/.test(document.querySelector('[data-msg=rg]').textContent), null, { timeout: 15000 });
  const rl = await get('/__aba?nome=RelGdvLancamentos');
  ok(rl.some(l => l[0] === '2026|09|pce.medidaFito' && l[4] === 7) && rl.some(l => l[0] === '2026|09|tab.ptv' && /ABACAXI/.test(l[5])), 'linhas do relatório gravadas pela tela');
  await shot(p, 'portal_relatorios');
  await PORTAL.aba(p, 'historico'); await p.waitForSelector('#adm-tab-hist');
  ok(/Desembolso/.test(await p.textContent('#adm-tab-hist')), 'aba Histórico');
  ok(!p.errosPag.length, 'portal sem erros de JavaScript', p.errosPag);
  for (const [tema, esq] of [['claro', 'light'], ['escuro', 'dark']]) {
    const pc = await PORTAL.abrir(b, SA, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: esq, aba: 'desembolso' });
    await pc.waitForSelector('#pn-conv-fin-form');
    ok(await pc.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `celular ${tema}: sem rolagem horizontal`);
    await shot(pc, 'portal_celular_' + tema, false);
    await pc.context().close();
  }
  // painel: leitura dos lançamentos (conta de gerência com a sessão aberta)
  const pp = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' }).then(async c => {
    await c.addInitScript(([ls, url]) => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', url); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } }, [LOGIN.lsPainel(GER), amb.API_URL]);
    await c.route('https://tile.openstreetmap.org/**', rt => rt.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    const x = await c.newPage(); x.on('dialog', d => d.accept()); await x.goto(amb.PAINEL); await x.waitForSelector('#pn-conteudo .pn-kpi', { timeout: 30000 }); return x; });
  await pp.click('.pn-aba[data-aba=convenios]'); await pp.waitForSelector('.pn-conv-etapa', { timeout: 30000 });
  await pp.click('[data-conv=visao][data-v=lanc]'); await pp.waitForSelector('#pn-conv-portal');
  ok(!(await pp.$('#pn-conv-lanc-form')) && /Lançado pelo Administrativo/.test(await pp.textContent('#pn-conv-visao')), 'painel → Lançamentos: sem formulário, aviso com link para o portal e quem lançou');
  await pp.click('[data-conv=visao][data-v=fin]'); await pp.waitForSelector('#pn-conv-portal');
  ok(!(await pp.$('#pn-conv-fin-form')) && !(await pp.$('#pn-conv-imp-arq')) && (await pp.textContent('#pn-conv')).includes(SRV), 'painel → Financeiro só leitura (sem formulário nem importação), lista com o nome do servidor');
  await shot(pp, 'painel_financeiro_so_leitura');
  const blocos = await pp.evaluate(() => { const s = Painel.aba('convenios').estado(); return JSON.stringify(ConvDocs.blocos(s.R, ConvDocs.textosIniciais(s.R.cfg, s.dados.relatorios, s.mes).textos, { numero: 1, dataEmissao: '2026-09-30' })); });
  ok(!blocos.includes(SRV) && /Execução financeira|EXECUÇÃO FINANCEIRA/i.test(blocos), 'relatório do convênio sem o nome do servidor das diárias');
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
