const amb = require('./lib/amb');
// Portal do Administrativo (web/administrativo/ + actions adm* e painelAdm* do Code.gs real via fakegas): lista de liberados no painel
// (e-mail normalizado, nome, máximo, revogar), login por código (permanente), bloqueio após 10 recusas, sessão com hash, expirada,
// revogada e encerrada; a sessão do portal não vale no painel nem no app (e vice-versa); desembolso (saldo ao vivo, memorando repetido,
// diária acima do previsto, data fora da vigência, servidor da lista — nome só no portal/planilha), importação pela action do portal,
// lançamentos físicos e linhas manuais de relatório com histórico; o painel não tem mais formulários de lançamento e as actions antigas
// de gravação recusam; nomes de servidores não aparecem nas respostas do painel nem no relatório; tela do portal (desembolso, físico,
// linhas dos relatórios, histórico, celular claro/escuro) e o bloco de liberados no painel. O login com Google foi removido.
const fs = require('fs'), path = require('path');
const { API } = amb;
const PORTAL = require('./lib/portal');
const post = b => fetch(API + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(API + p).then(r => r.json());
const gerar = (nome, perfil) => get('/__gerar?nome=' + encodeURIComponent(nome) + (perfil ? '&perfil=' + perfil : ''));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700))); if (!c) falhas++; };
const SAIDA = process.env.GDV_SAIDA_ADM || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const shot = async (p, nome, full = true) => { await p.screenshot({ path: amb.saida('adm_' + nome + '.png'), fullPage: full }); if (SAIDA) fs.copyFileSync(amb.saida('adm_' + nome + '.png'), path.join(SAIDA, nome + '.png')); };
const SRV = 'Servidora Diarista Secreta';      // nome de servidor das diárias: só no portal e na planilha

(async () => {
  /* ================= 1. liberados no painel ================= */
  console.log('1. Painel → liberados do Portal do Administrativo');
  await fetch(API + '/__fn?nome=desativarRotinasAutomaticas_');
  const adm = await gerar('Gerente Portal', 'admin'), TOK = (await post({ action: 'painelAtivar', codigo: adm.codigo })).token;
  const fis = await gerar(SRV), TOKF = (await post({ action: 'ativar', codigo: fis.codigo })).token;
  await gerar('Outro Servidor Campo');
  ok(TOK && TOKF, 'credenciais de administrador do painel e de fiscal');
  for (const a of ['painelAdmLista', 'painelAdmSalvar', 'painelAdmCodigo', 'painelAdmOcultar']) {
    const r = await post({ action: a, key: TOKF, email: 'x@gmail.com', nome: 'Xis Ipsilon', id: 'x' });
    ok(!r.ok && /Acesso restrito/.test(r.erro), `fiscal recusado em ${a}`, r);
  }
  let r = await post({ action: 'painelAdmSalvar', key: TOK, email: 'nao-e-email', nome: 'Ana Souza' }); ok(!r.ok && /E-mail inválido/.test(r.erro), 'e-mail inválido recusado', r.erro);
  r = await post({ action: 'painelAdmSalvar', key: TOK, email: 'ana@gmail.com', nome: 'Ana' }); ok(!r.ok && /nome completo/.test(r.erro), 'nome sem sobrenome recusado', r.erro);
  const A1 = await post({ action: 'painelAdmSalvar', key: TOK, email: '  Ana.Souza@GMAIL.com ', nome: 'Ana Souza Administrativa' });
  ok(A1.ok && A1.liberado.email === 'ana.souza@gmail.com' && A1.liberado.ativo === 1 && A1.liberado.criadoPor === 'Gerente Portal', 'liberado com e-mail normalizado (minúsculas, sem espaços) e quem liberou', A1);
  r = await post({ action: 'painelAdmSalvar', key: TOK, email: 'ana.souza@gmail.com', nome: 'Ana Repetida Souza', id: '' }); ok(r.ok && r.liberado.id === A1.liberado.id, 'mesmo e-mail sem id = edição da mesma linha (não duplica)', r);
  const A2 = await post({ action: 'painelAdmSalvar', key: TOK, email: 'bia.lima@gmail.com', nome: 'Bia Lima Administrativa' });
  const A3 = await post({ action: 'painelAdmSalvar', key: TOK, email: 'caio.reis@gmail.com', nome: 'Caio Reis Administrativo' });
  await fetch(API + '/__props?set=ADM_MAX&valor=3');
  r = await post({ action: 'painelAdmSalvar', key: TOK, email: 'quarta@gmail.com', nome: 'Quarta Pessoa Teste' }); ok(!r.ok && /Limite de 3/.test(r.erro), 'máximo configurável (ADM_MAX = 3): a 4ª pessoa ativa é recusada', r.erro);
  await fetch(API + '/__props?set=ADM_MAX');
  const L = await post({ action: 'painelAdmLista', key: TOK });
  ok(L.ok && L.liberados.length === 3 && L.max === 10 && !('google' in L), 'lista: 3 liberados, máximo padrão 10, sem campo do Google (login removido)', L);

  /* ================= 2. login (o Google foi removido) e bloqueio ================= */
  console.log('2. Login por código; o login com Google não existe mais; bloqueio');
  r = await post({ action: 'admLogin', idToken: 'eyJhbGciOiJSUzI1NiJ9.valido-ana.assinatura-abc123' }); ok(!r.ok && /Ação inválida/.test(r.erro), 'admLogin não existe mais', r.erro);
  const CA = await post({ action: 'painelAdmCodigo', key: TOK, id: A1.liberado.id });
  const G = await post({ action: 'admCodigo', codigo: CA.codigo });
  ok(G.ok && /^[0-9a-f]{64}$/.test(G.sessao) && G.email === 'ana.souza@gmail.com' && G.nome === 'Ana Repetida Souza' && G.origem === 'codigo', 'Ana entra por código: sessão do portal', G);
  let tudo = JSON.stringify(await get('/__tudo'));
  ok(!tudo.includes(G.sessao) && tudo.includes(require('crypto').createHash('sha256').update(G.sessao).digest('hex')), 'planilha: a sessão não fica em claro (só o SHA-256)');
  // bloqueio: 10 recusas em 15 min
  await fetch(API + '/__cache?del=falhas_adm');
  for (let i = 0; i < 10; i++) await post({ action: 'admCodigo', codigo: '000000' });
  r = await post({ action: 'admCodigo', codigo: CA.codigo }); ok(!r.ok && /Muitas tentativas/.test(r.erro), 'depois de 10 recusas, até o código válido fica bloqueado (15 min)', r.erro);
  await fetch(API + '/__cache?del=falhas_adm');

  /* ================= 3. código, sessão expirada/revogada, isolamento ================= */
  console.log('3. Código de ativação, sessão e isolamento');
  const C2 = await post({ action: 'painelAdmCodigo', key: TOK, id: A2.liberado.id });
  ok(C2.ok && /^\d{6}$/.test(C2.codigo) && C2.expiraEm === 0 && C2.permanente === true, 'painel gera código de 6 dígitos, permanente, para o liberado', C2);
  const S2 = await post({ action: 'admCodigo', codigo: C2.codigo });
  ok(S2.ok && S2.nome === 'Bia Lima Administrativa' && S2.origem === 'codigo', 'login por código → mesma sessão do portal', S2);
  r = await post({ action: 'admCodigo', codigo: C2.codigo }); ok(r.ok && r.sessao !== S2.sessao, 'código permanente: o mesmo código entra de novo (nova sessão)', r.erro || r.origem);
  const lst = await post({ action: 'painelAdmLista', key: TOK });
  ok(lst.liberados.find(x => x.id === A2.liberado.id).codigo === C2.codigo, 'painel continua mostrando o código depois do uso');
  const C3 = await post({ action: 'painelAdmCodigo', key: TOK, id: A3.liberado.id });
  await get(`/__editar?aba=Administrativo&col=codigoExpira&valor=1&onde=id:${A3.liberado.id}`);   // validade antiga (7 dias) vencida
  r = await post({ action: 'admCodigo', codigo: C3.codigo }); ok(r.ok, 'código com a validade antiga vencida continua valendo (sem expiração)', r.erro);
  const C3b = await post({ action: 'painelAdmCodigo', key: TOK, id: A3.liberado.id });
  r = await post({ action: 'admCodigo', codigo: C3.codigo }); ok(!r.ok && /substituído/.test(r.erro), 'gerar outro código invalida o anterior', r.erro);
  const S3 = await post({ action: 'admCodigo', codigo: C3b.codigo });
  ok(S3.ok, 'novo código para Caio');
  // isolamento
  r = await post({ action: 'painelConvenios', key: G.sessao }); ok(!r.ok && /Sessão do painel inválida/.test(r.erro), 'sessão do portal não vale no painel', r.erro);
  r = await post({ action: 'sync', key: G.sessao, since: 0 }); ok(!r.ok && /Acesso revogado ou inválido/.test(r.erro), 'sessão do portal não vale no app de campo', r.erro);
  r = await post({ action: 'admDados', sessao: TOK }); ok(!r.ok && /Sessão do portal/.test(r.erro), 'credencial do painel não vale no portal', r.erro);
  r = await post({ action: 'admDados', sessao: 'segredo' }); ok(!r.ok && /Sessão do portal inválida/.test(r.erro), 'chave mestra (ACCESS_KEY) não vale no portal', r.erro);
  r = await post({ action: 'admDados' }); ok(!r.ok && /Sessão do portal/.test(r.erro), 'sem sessão: recusado', r.erro);
  // expirada
  const sesTab = await get('/__aba?nome=AdmSessoes'), iAdm = sesTab[0].indexOf('admId');
  ok(sesTab.length === 6 && sesTab.slice(1).every(l => /^[0-9a-f]{64}$/.test(l[1])), 'aba AdmSessoes: 5 sessões, só com hash', sesTab.length);
  await get(`/__editar?aba=AdmSessoes&col=expiraEm&valor=1&onde=admId:${A2.liberado.id}`);
  r = await post({ action: 'admDados', sessao: S2.sessao }); ok(!r.ok && /expirada/.test(r.erro), 'sessão expirada (30 dias sem uso) recusada', r.erro);
  void iAdm;
  // revogada
  r = await post({ action: 'admDados', sessao: S3.sessao }); ok(r.ok, 'Caio usa o portal');
  r = await post({ action: 'painelAdmSalvar', key: TOK, id: A3.liberado.id, email: 'caio.reis@gmail.com', nome: 'Caio Reis Administrativo', ativo: 0 });
  ok(r.ok && r.liberado.ativo === 0, 'painel revoga Caio');
  r = await post({ action: 'admDados', sessao: S3.sessao }); ok(!r.ok && /Sessão do portal/.test(r.erro), 'revogado: a sessão cai na próxima chamada', r.erro);
  r = await post({ action: 'painelAdmCodigo', key: TOK, id: A3.liberado.id }); ok(!r.ok && /revogado/.test(r.erro), 'revogado não recebe código', r.erro);
  r = await post({ action: 'admCodigo', codigo: C3b.codigo }); ok(!r.ok, 'revogado: o código permanente deixa de valer', r.erro);
  // "Remover" (oculto = 1; nada é apagado) e "Restaurar"
  const abaAdm = () => get('/__aba?nome=Administrativo'), linhaAdm = (t, id) => { const c = t[0]; const l = t.find(x => x[0] === id); return l && Object.fromEntries(c.map((k, i) => [k, l[i]])); };
  let tA = await abaAdm(); const nAdm = tA.length;
  ok(tA[0].join() === 'id,email,nome,ativo,criadoEm,criadoPor,ultimoAcesso,codigo,codigoExpira,atualizadoEm,atualizadoPor,oculto,ocultoPor,ocultoEm', 'aba Administrativo: oculto/ocultoPor/ocultoEm acrescentadas no fim', tA[0]);
  r = await post({ action: 'painelAdmOcultar', key: TOK, id: A1.liberado.id }); ok(!r.ok && /ainda está liberado/.test(r.erro) && /revogue/i.test(r.erro), 'liberado ativo não sai da lista (revogue antes)', r.erro);
  r = await post({ action: 'painelAdmOcultar', key: TOK, id: 'nao-existe' }); ok(!r.ok && /não encontrado/.test(r.erro), 'id inexistente: erro', r.erro);
  r = await post({ action: 'painelAdmOcultar', key: TOK }); ok(!r.ok && /Informe/.test(r.erro), 'sem id: erro', r.erro);
  r = await post({ action: 'painelAdmOcultar', key: G.sessao, id: A3.liberado.id }); ok(!r.ok && /Sessão do painel inválida/.test(r.erro), 'sessão do portal não remove ninguém', r.erro);
  r = await post({ action: 'painelAdmOcultar', key: TOK, id: A3.liberado.id });
  ok(r.ok && r.oculto === 1 && r.id === A3.liberado.id && r.nome === 'Caio Reis Administrativo', 'revogado removido da lista', r);
  tA = await abaAdm(); let la3 = linhaAdm(tA, A3.liberado.id);
  ok(tA.length === nAdm && la3 && la3.oculto === 1 && la3.ocultoPor === 'Gerente Portal' && la3.ocultoEm > Date.now() - 60000 && la3.ativo === 0 && la3.email === 'caio.reis@gmail.com',
    'planilha: linha continua (oculto=1, ocultoPor, ocultoEm; ainda revogada; nada apagado)', la3);
  let LL = await post({ action: 'painelAdmLista', key: TOK });
  ok(LL.ok && LL.ocultar === true && !LL.liberados.some(x => x.id === A3.liberado.id) && !LL.liberados.some(x => 'oculto' in x), 'painelAdmLista não devolve removidos (e avisa ocultar:true)', LL.liberados.map(x => x.nome));
  LL = await post({ action: 'painelAdmLista', key: TOK, ocultos: true });
  let x3 = LL.liberados.find(x => x.id === A3.liberado.id);
  ok(x3 && x3.oculto === 1 && x3.ocultoPor === 'Gerente Portal' && x3.ativo === 0 && LL.liberados.filter(x => x.oculto).length === 1, 'com ocultos:true vem marcado oculto:1 (quem removeu)', x3);
  r = await post({ action: 'admCodigo', codigo: C3b.codigo }); ok(!r.ok, 'removido continua sem entrar no portal', r.erro);
  r = await post({ action: 'painelAdmCodigo', key: TOK, id: A3.liberado.id }); ok(!r.ok && /revogado/.test(r.erro), 'removido não recebe código', r.erro);
  r = await post({ action: 'painelAdmOcultar', key: TOK, id: A3.liberado.id }); ok(r.ok && r.oculto === 1 && linhaAdm(await abaAdm(), A3.liberado.id).ocultoEm === la3.ocultoEm, 'remover de novo: sem efeito (mantém quando foi removido)', r);
  r = await post({ action: 'painelAdmOcultar', key: TOK, id: A3.liberado.id, restaurar: true });
  ok(r.ok && r.oculto === 0, 'Restaurar', r);
  la3 = linhaAdm(await abaAdm(), A3.liberado.id);
  ok(la3.oculto === 0 && la3.ocultoPor === 'Gerente Portal' && la3.ativo === 0, 'restaurado: oculto=0, ocultoPor/ocultoEm ficam como registro, continua revogado', la3);
  LL = await post({ action: 'painelAdmLista', key: TOK }); ok(LL.liberados.some(x => x.id === A3.liberado.id && x.ativo === 0 && !('oculto' in x)), 'restaurado volta à lista');
  // reativar pelo painelAdmSalvar desfaz a remoção
  await post({ action: 'painelAdmOcultar', key: TOK, id: A3.liberado.id });
  r = await post({ action: 'painelAdmSalvar', key: TOK, id: A3.liberado.id, email: 'caio.reis@gmail.com', nome: 'Caio Reis Administrativo', ativo: 1 });
  ok(r.ok && r.liberado.ativo === 1 && !('oculto' in r.liberado) && linhaAdm(await abaAdm(), A3.liberado.id).oculto === 0, 'removido reativado (painelAdmSalvar ativo=1): oculto=0', r);
  LL = await post({ action: 'painelAdmLista', key: TOK }); ok(LL.liberados.some(x => x.id === A3.liberado.id && x.ativo === 1), 'reativado volta à lista');
  r = await post({ action: 'painelAdmOcultar', key: TOK, id: A3.liberado.id }); ok(!r.ok && /ainda está liberado/.test(r.erro), 'reativado: não pode ser removido', r.erro);
  r = await post({ action: 'painelAdmSalvar', key: TOK, id: A3.liberado.id, email: 'caio.reis@gmail.com', nome: 'Caio Reis Administrativo', ativo: 0 }); ok(r.ok && r.liberado.ativo === 0, 'revoga Caio de novo');
  ok((await abaAdm()).length === nAdm, 'nenhuma linha apagada nem duplicada na aba Administrativo');

  /* ================= 4. lançamentos pelo portal ================= */
  console.log('4. Desembolso, físico, linhas de relatório e histórico');
  const S = G.sessao, D = await post({ action: 'admDados', sessao: S });
  ok(D.ok && D.nome === 'Ana Repetida Souza' && Array.isArray(D.servidores) && !D.servidores.length, 'admDados: sugestões de servidores começam vazias (vêm dos lançamentos; não são os fiscais)', D.servidores);
  const FL = l => post({ action: 'admConvFinLancar', sessao: S, lancamento: { convenio: '991272-2025', ...l } });
  let f = await FL({ etapa: '1.4', item: '1.4.3', data: '2026-09-10', valor: 1200, quantidade: 10, tipoDiaria: 'NM', servidorNome: '  ' + SRV + '  ', documento: 'Memo nº 100/2026', descricao: 'Diárias levantamento' });
  ok(f.ok && f.lancamento.servidorNome === SRV && /^srv-[0-9a-f]{12}$/.test(f.lancamento.servidorId) && f.lancamento.usuario === 'Ana Repetida Souza' && !f.avisos.length, 'desembolso com servidor digitado livremente (nome normalizado, id estável) e quem lançou', f);
  const D2 = await post({ action: 'admDados', sessao: S }), srv = D2.servidores.find(x => x.nome === SRV);
  ok(srv && srv.id === f.lancamento.servidorId, 'o nome lançado passa a ser sugerido no autopreenchimento', D2.servidores);
  const ID_FIN = f.lancamento.id;
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
  ok(lf.ok && lf.lancamento.usuario === 'Ana Repetida Souza', 'lançamento físico 1.5 pelo portal', lf);
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
  const hist = await get('/__aba?nome=AdmHistorico');
  ok(!JSON.stringify(hist).includes('ana.souza@gmail.com'), 'histórico guarda nome e admId, não o e-mail (e-mails só na aba Administrativo)');
  const cf = await get('/__aba?nome=ConvFinanceiro'), iN = cf[0].indexOf('servidorNome'), iA = cf[0].indexOf('admId');
  ok(cf.slice(1).some(l => l[iN] === SRV) && cf.slice(1).every(l => !l[iA] || l[iA] === A1.liberado.id), 'aba ConvFinanceiro: nome do servidor e admId de quem lançou (planilha)');
  tudo = JSON.stringify(await get('/__tudo'));
  ok(!['ConvLancamentos', 'ConvFinanceiro', 'RelGdvLancamentos', 'AdmSessoes', 'AdmHistorico'].some(a => JSON.stringify((JSON.parse(tudo))[a] || []).includes('@gmail.com')), 'e-mails só na aba Administrativo');

  /* ================= 5. painel: só leitura ================= */
  console.log('5. Painel: actions antigas recusam e nenhum nome de servidor');
  for (const [a, extra] of [['painelConvLancar', { lancamento: { convenio: '991272-2025', etapa: '1.5', submeta: 'tabatinga', data: '2026-09-01', quantidade: 1 } }],
    ['painelConvFinLancar', { lancamento: { convenio: '991272-2025', etapa: '1.4', item: '1.4.3', data: '2026-09-01', valor: 10 } }], ['painelConvFinImportar', { convenio: '991272-2025', itens: IT }],
    ['painelConvExcluir', { id: ID_FIN }], ['painelConvFinExcluir', { id: ID_FIN }], ['painelRelGdvSalvar', { ano: 2026, lancamentos: [{ mes: '09', chave: 'pce.capacitacao', valor: 9 }] }]]) {
    const x = await post({ action: a, key: TOK, ...extra }); ok(!x.ok && /Portal do Administrativo/.test(x.erro), `painel: ${a} recusa ("Lançamentos são feitos no Portal do Administrativo")`, x);
  }
  r = await post({ action: 'painelRelGdvSalvar', key: TOK, ano: 2026, tipo: 'mensal', mes: '09', textos: { introducao: 'Texto do gerente.' } }); ok(r.ok, 'painel continua salvando os TEXTOS dos relatórios');
  const PC = await post({ action: 'painelConvenios', key: TOK }), PR = await post({ action: 'painelRelGdv', key: TOK, ano: 2026 });
  ok(PC.ok && PC.financeiro.length === 4 && PC.financeiro.some(l => l.servidorNome === SRV), 'painelConvenios (só administrador): financeiro com o nome do servidor da diária', PC.financeiro[0]);
  ok(PR.ok && PR.lancamentos.some(l => l.chave === 'pce.capacitacao' && l.usuario === 'Ana Repetida Souza'), 'painelRelGdv: lançamentos do portal com quem lançou (só leitura)');

  /* ================= 6. telas ================= */
  console.log('6. Telas do portal e do painel');
  const b = await amb.lancar();
  // entra por código para as telas
  const SA = await PORTAL.sessao(TOK, 'ana.souza@gmail.com', 'Ana Repetida Souza');
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
  ok(await p.inputValue('.pn-rg-in[data-chave="pce.capacitacao"]') === '3' && /lançado por Ana Repetida Souza/.test(await p.getAttribute('.pn-rg-in[data-chave="pce.capacitacao"]', 'title')), 'linhas dos relatórios: valor lançado e quem lançou');
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
  // painel
  const pp = await b.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Manaus', locale: 'pt-BR', serviceWorkers: 'block' }).then(async c => {
    await c.addInitScript(([tok, url]) => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', 1); localStorage.setItem('gdv.url', url); localStorage.setItem('gdv.painel.token', tok); localStorage.setItem('gdv.painel.nome', 'Gerente Portal'); } }, [TOK, amb.API_URL]);
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
  await pp.click('.pn-aba[data-aba=acessos]'); await pp.waitForSelector('#pn-adm-lista table', { timeout: 20000 });
  ok(/ana\.souza@gmail\.com/.test(await pp.textContent('#pn-adm')) && /Revogado/.test(await pp.textContent('#pn-adm')), 'painel → Servidores: liberados do portal (e-mail, situação)');
  await pp.fill('#pn-adm-email', 'dani.nova@gmail.com'); await pp.fill('#pn-adm-nome', 'Dani Nova Administrativa'); await pp.click('#pn-adm-liberar');
  await pp.waitForFunction(() => /Liberado/.test(document.querySelector('[data-msg=adm]').textContent), null, { timeout: 15000 });
  await pp.click('#pn-adm-lista tr:has-text("dani.nova@gmail.com") [data-adm=codigo]'); await pp.waitForSelector('#pn-adm-codigo');
  const cod = (await pp.textContent('#pn-adm-codigo .pn-ac-codigo')).replace(/\D/g, '');
  r = await post({ action: 'admCodigo', codigo: cod }); ok(r.ok && r.nome === 'Dani Nova Administrativa', 'liberar e gerar código pela tela do painel; o código entra no portal', r);
  // Remover / Mostrar removidos / Restaurar pela tela
  const trCaio = '#pn-adm-lista tr:has-text("caio.reis@gmail.com")';
  ok(await pp.isVisible(trCaio + ' [data-adm=remover]') && !(await pp.$('#pn-adm-lista tr:has-text("ana.souza@gmail.com") [data-adm=remover]')), 'botão Remover só na linha revogada (ativo não tem)');
  pp.dialogos = []; pp.on('dialog', d => pp.dialogos.push(d.message()));
  await pp.click(trCaio + ' [data-adm=remover]');
  await pp.waitForFunction(() => !document.querySelector('#pn-adm-lista').textContent.includes('caio.reis@gmail.com'), null, { timeout: 15000 });
  ok(pp.dialogos.length === 1 && /Remover Caio Reis Administrativo da lista/.test(pp.dialogos[0]) && /saiu da lista/.test(await pp.textContent('[data-msg=adm]')), 'Remover: confirmação, a linha some e aviso', pp.dialogos);
  ok(linhaAdm(await abaAdm(), A3.liberado.id).oculto === 1, 'planilha: oculto=1 (removido pela tela)');
  await pp.check('#pn-adm-removidos'); await pp.waitForSelector(trCaio + ' [data-adm=restaurar]', { timeout: 15000 });
  ok(/removido da lista/.test(await pp.textContent(trCaio)), '"Mostrar removidos": aparece com o selo e Restaurar');
  await pp.click(trCaio + ' [data-adm=restaurar]'); await pp.waitForSelector(trCaio + ' [data-adm=remover]', { timeout: 15000 });
  ok(linhaAdm(await abaAdm(), A3.liberado.id).oculto === 0 && await pp.isChecked('#pn-adm-removidos'), 'Restaurar pela tela: oculto=0 e volta com Remover');
  await pp.uncheck('#pn-adm-removidos'); await pp.waitForTimeout(800);
  ok(await pp.isVisible(trCaio), 'sem "Mostrar removidos": Caio continua na lista (restaurado)');
  await pp.locator('#pn-adm').screenshot({ path: amb.saida('adm_painel_liberados.png') }); if (SAIDA) fs.copyFileSync(amb.saida('adm_painel_liberados.png'), path.join(SAIDA, 'painel_liberados.png'));
  await b.close();
  console.log(falhas ? `FALHOU=${falhas}` : 'OK');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); console.log('FALHOU=1'); process.exit(1); });
