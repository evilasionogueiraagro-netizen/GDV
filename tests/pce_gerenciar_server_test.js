const amb = require('./lib/amb');
const U = require('./lib/usuarios');
// PCE, "Gerenciar termos realizados" (permissão digitarDoPapel / coluna antigo), Code.gs real no fakegas:
//   1) ver: quem tem o PCE lista e abre Termos e Cadastros de TODOS os servidores (o sync continua só com os próprios);
//   2) editar: com a permissão, Termo e Cadastro de outro servidor; sem ela o Termo é recusado; o TF de Barreira não muda;
//   3) rastreabilidade: o autor continua o mesmo e HistoricoDeAlteracoes guarda quem alterou, quando e o antes/depois dos campos mudados;
//   4) rótulo novo no painel e nos manuais. Dados fictícios.
const fs = require('fs'), path = require('path');
const B = amb.API;
const post = b => fetch(B + '/', { method: 'POST', body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(B + p).then(r => r.json());
const fn = (nome, ...args) => get('/__fn?nome=' + nome + '&args=' + encodeURIComponent(JSON.stringify(args)));
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' -> ' + JSON.stringify(x).slice(0, 300))); if (!c) falhas++; };
(async () => {
  const ANO = new Date().getFullYear(), agora = Date.now(), CPF = '52998224725';
  const mk = (nome, o) => U.fiscal(nome, { permissoes: U.lista({ veiculos: 1, tf: 1, pce: 1, ...o }) });
  const autora = await mk('Pessoa Ficticia Autora', {}), gestor = await mk('Pessoa Ficticia Gestora', { antigo: 1 }), leitor = await mk('Pessoa Ficticia Leitora', {});
  const semPce = await U.fiscal('Pessoa Ficticia SemPce', { permissoes: ['campo', 'fiscalizacaoDeTransito'] });
  const lerAba = async n => (await fn('lerLeitura_', n)).r;
  const hist = async () => (await lerAba('HistoricoDeAlteracoes')).filter(h => /Termo do PCE|Cadastro do PCE/.test(h.acao));

  const termo = (id, numero, extra = {}) => ({ id, unidade: 'AUTAZES', ano: ANO, numero, numeroSugerido: numero, numeroOrigem: 'sistema', conflito: 0, propriedadeId: 'P-GER', programa: 'moniliase',
    doc: CPF, nome: 'Fulano Ficticio Teste', municipio: 'Autazes', data: `${ANO}-03-10`, hora: '10:00', servidor: 'Pessoa Ficticia Autora', pragas: '[]', acoes: '[]', tipoLocal: '["Sitio"]',
    testemunhas: '[]', cancelado: 0, excluido: 0, criadoEm: agora + numero, atualizadoEm: agora + numero, visitaId: 'v-' + id, programaVisita: 'Monilíase do Cacaueiro',
    culturas: JSON.stringify([{ cultura: 'Cacau', area: 1, pragas: [{ praga: 'Monilíase do Cacaueiro', resultado: 'nao_detectada' }], coleta: 'Não', fotos: [] }]), ...extra });
  const cadastro = (id, numero, extra = {}) => ({ id, programa: 'moniliase', unidade: 'AUTAZES', ano: ANO, numero, numeroSugerido: numero, numeroOrigem: 'sistema', conflito: 0, propriedadeId: 'P-GER',
    doc: CPF, nome: 'Fulano Ficticio Teste', propriedade: 'Sitio Gerenciar Ficticio', municipio: 'Autazes', data: `${ANO}-03-09`, hora: '09:00', servidor: 'Pessoa Ficticia Autora',
    dados: '{}', fotos: '[]', assinaturas: '{}', documentos: '[]', excluido: 0, criadoEm: agora + numero, atualizadoEm: agora + numero, ...extra });
  const sync = (key, c) => post({ action: 'sync', key, since: 0, ...c });
  const TF = (id, numero, extra = {}) => ({ id, barreira: 'BVA-CEASA', ano: ANO, numero, numeroTxt: String(numero).padStart(4, '0') + '/' + ANO + ' - BVA - CEASA', data: '2026-10-10', hora: '09:00',
    fiscal: 'x', local: 'BR-319 PORTO DA CEASA', placa: 'ABC1D23', doc: CPF, nome: 'Fulano Ficticio Teste', procedimento: 'apreensao', auto: 0, advertencia: 0, constatacao: 'x',
    produtos: '["MANGA - 10 Kg"]', cancelado: 0, conflito: 0, numeroSugerido: numero, numeroOrigem: 'sistema', criadoEm: agora + numero, atualizadoEm: agora + numero, ...extra });

  console.log('1) a autora grava dois Termos e um Cadastro');
  const P = { id: 'P-GER', nome: 'Sitio Gerenciar Ficticio', doc: CPF, municipio: 'Autazes', criadoEm: agora, atualizadoEm: agora };
  let r = await sync(autora.token, { propriedades: [P], termosPce: [termo('tg1', 1), termo('tg2', 2, { visitaId: 'v-tg2', municipio: 'Coari', nome: 'Fulano Ficticio Outro', doc: '11144477735' })], cadastrosPce: [cadastro('cg1', 1)] });
  ok(r.ok && !Object.keys(r.recusados).length, 'Termos e Cadastro da autora gravados', r.recusados);
  ok((await lerAba('TermosPCE')).filter(t => /^tg/.test(t.id)).every(t => t.usuario === autora.nome), 'o autor gravado é a autora');

  console.log('2) ver: quem tem o PCE enxerga os Termos e Cadastros de todos os servidores (sob demanda)');
  r = await post({ action: 'pceTermosBuscar', key: leitor.token, tipo: 'termo' });
  ok(r.ok && r.total === 2 && r.itens.length === 2 && r.itens.every(i => i.autor === autora.nome && i.minha === 0), 'a leitora (só PCE) lista os 2 Termos da autora, de outro servidor', r);
  ok(r.itens.every(i => !('doc' in i) && !('endereco' in i) && !('assinaturas' in i)), 'a lista não traz CPF, endereço nem assinaturas');
  ok(r.itens[0].id === 'tg2' || r.itens[0].id === 'tg1', 'itens da lista identificam o registro (id, número, produtor)');
  r = await post({ action: 'pceTermosBuscar', key: leitor.token, tipo: 'termo', municipio: 'Coari' });
  ok(r.ok && r.total === 1 && r.itens[0].id === 'tg2', 'filtro por município', r.itens);
  r = await post({ action: 'pceTermosBuscar', key: leitor.token, tipo: 'termo', q: '111.444.777-35' });
  ok(r.ok && r.total === 1 && r.itens[0].id === 'tg2', 'busca por CPF (só os dígitos conferem; o CPF não volta na lista)', r.itens);
  r = await post({ action: 'pceTermosBuscar', key: leitor.token, tipo: 'termo', q: 'cacau' });
  ok(r.ok && r.total === 2 && r.itens.every(i => i.culturas === 'Cacau'), 'busca por cultura');
  r = await post({ action: 'pceTermosBuscar', key: leitor.token, tipo: 'termo', de: `${ANO}-12-01` });
  ok(r.ok && r.total === 0, 'filtro por período');
  r = await post({ action: 'pceTermosBuscar', key: leitor.token, tipo: 'cadastro' });
  ok(r.ok && r.total === 1 && r.itens[0].id === 'cg1' && r.itens[0].autor === autora.nome && r.itens[0].propriedade === 'Sitio Gerenciar Ficticio', 'Cadastros de todos os servidores', r.itens);
  r = await post({ action: 'pceTermosBuscar', key: leitor.token, tipo: 'termo', pular: 1 });
  ok(r.ok && r.total === 2 && r.itens.length === 1, 'paginação (pular)');
  r = await post({ action: 'pceRegistroObter', key: leitor.token, tipo: 'termo', id: 'tg1' });
  ok(r.ok && r.registro.id === 'tg1' && r.registro.usuario === autora.nome && JSON.parse(r.registro.culturas)[0].cultura === 'Cacau' && r.propriedade && r.propriedade.id === 'P-GER'
    && r.pessoa === null || (r.pessoa && r.pessoa.id === CPF), 'a leitora abre o Termo completo da autora (com a propriedade)', r.erro);
  ok(r.podeEditar === 0, 'a leitora não tem a permissão de editar (a tela esconde os botões)');
  r = await post({ action: 'pceRegistroObter', key: leitor.token, tipo: 'cadastro', id: 'cg1' });
  ok(r.ok && r.registro.id === 'cg1', 'abre o Cadastro de outro servidor');
  r = await post({ action: 'pceRegistroObter', key: leitor.token, tipo: 'termo', id: 'nao-existe' });
  ok(!r.ok && /não encontrado/.test(r.erro), 'registro inexistente');
  r = await post({ action: 'pceTermosBuscar', key: semPce.token, tipo: 'termo' });
  ok(!r.ok && r.semPermissao === 'pce', 'sem o módulo PCE não lista', r);
  r = await post({ action: 'pceRegistroObter', key: semPce.token, tipo: 'termo', id: 'tg1' });
  ok(!r.ok && r.semPermissao === 'pce', 'sem o módulo PCE não abre', r);
  r = await post({ action: 'sync', key: leitor.token, since: 0 });
  ok(r.ok && !(r.termosPce || []).length && !(r.cadastrosPce || []).length, 'o sync da leitora continua só com os próprios (nada de outros servidores no aparelho)', [r.termosPce, r.cadastrosPce].map(x => (x || []).length));
  const lidos = (await lerAba('AcessosADados')).filter(x => /pceTermosBuscar|pceRegistroObter/.test(x.acao));
  ok(lidos.some(x => x.acao === 'pceTermosBuscar') && lidos.some(x => x.acao === 'pceRegistroObter'), 'a leitura de dado de outro servidor fica em AcessosADados (LGPD)');

  console.log('3) editar: sem a permissão, o Termo de outro servidor é recusado e nada muda');
  r = await sync(leitor.token, { termosPce: [termo('tg1', 1, { nome: 'Nome Alterado Indevido', atualizadoEm: agora + 1000 })] });
  ok(r.ok && (r.recusados.termosPce || []).includes('tg1'), 'leitora (sem Gerenciar termos realizados): recusado', r.recusados);
  ok((await lerAba('TermosPCE')).find(t => t.id === 'tg1').nome === 'Fulano Ficticio Teste', 'o Termo continua como a autora gravou');
  r = await post({ action: 'pceDocRegistrar', key: leitor.token, tipo: 'termo', registro: termo('tg1', 1, { nome: 'Nome Alterado Indevido', atualizadoEm: agora + 1000 }) });
  ok(!r.ok && /outro servidor/.test(r.erro), 'pceDocRegistrar de Termo alheio sem a permissão: recusado', r.erro);
  ok((await hist()).length === 0, 'recusado não deixa linha de auditoria');

  console.log('4) editar: com a permissão, qualquer servidor; o autor não muda e a auditoria guarda antes e depois');
  const antes = (await lerAba('TermosPCE')).find(t => t.id === 'tg1');
  const quando = Date.now();
  r = await sync(gestor.token, { termosPce: [termo('tg1', 1, { nome: 'Nome Corrigido Ficticio', constatacao: 'Corrigido pela gestora', atualizadoEm: agora + 2000 })] });
  ok(r.ok && !(r.recusados.termosPce || []).length, 'gestora (com Gerenciar termos realizados): aceito', r.recusados);
  let t = (await lerAba('TermosPCE')).find(x => x.id === 'tg1');
  ok(t.nome === 'Nome Corrigido Ficticio' && t.constatacao === 'Corrigido pela gestora', 'o Termo foi alterado');
  ok(t.usuario === autora.nome && t.usuario === antes.usuario, 'o autor continua a autora (a coluna usuario não vira a gestora)', t.usuario);
  let h = await hist();
  ok(h.length === 1, 'uma linha de auditoria', h);
  const a = h[0] || {}, aAntes = JSON.parse(a.antes || '{}'), aDepois = JSON.parse(a.depois || '{}');
  ok(a.usuarioId === gestor.usuario.id && a.tabela === 'TermosPCE' && a.registroId === 'tg1' && Number(a.em) >= quando - 1000 && /autor: Pessoa Ficticia Autora/.test(a.acao), 'auditoria: quem alterou (id), quando, a tabela, o registro e o autor', a);
  ok(aAntes.nome === 'Fulano Ficticio Teste' && aDepois.nome === 'Nome Corrigido Ficticio' && aAntes.constatacao === '' && aDepois.constatacao === 'Corrigido pela gestora', 'auditoria: antes e depois dos campos alterados', [aAntes, aDepois]);
  ok(!('municipio' in aDepois) && !('srv_ts' in aDepois) && !('usuario' in aDepois) && !('atualizadoEm' in aDepois), 'auditoria só traz o que mudou (nem campos técnicos)', Object.keys(aDepois));
  r = await sync(gestor.token, { termosPce: [termo('tg1', 1, { nome: 'Nome Corrigido Ficticio', constatacao: 'Corrigido pela gestora', atualizadoEm: agora + 3000 })] });
  ok(r.ok && (await hist()).length === 1, 'reenvio sem mudança de campo: sem nova linha de auditoria');
  r = await sync(autora.token, { termosPce: [termo('tg1', 1, { nome: 'Nome Corrigido Ficticio', constatacao: 'A autora ajusta o texto', atualizadoEm: agora + 4000 })] });
  ok(r.ok && !(r.recusados.termosPce || []).length && (await hist()).length === 1, 'a própria autora editando o seu Termo: sem auditoria de "outro servidor"');
  r = await sync(autora.token, { since: 0 });
  ok((r.termosPce || []).some(x => x.id === 'tg1' && x.constatacao === 'A autora ajusta o texto'), 'a autora continua recebendo o próprio Termo no sync');

  console.log('5) cancelar o Termo de visita de outro servidor (única edição do Termo de visita) também fica registrado');
  r = await sync(gestor.token, { termosPce: [termo('tg2', 2, { visitaId: 'v-tg2', municipio: 'Coari', nome: 'Fulano Ficticio Outro', doc: '11144477735', cancelado: 1, motivoCancel: 'erro de digitação', atualizadoEm: agora + 5000 })] });
  ok(r.ok && !(r.recusados.termosPce || []).length, 'cancelamento aceito', r.recusados);
  h = await hist(); const c2 = h.find(x => x.registroId === 'tg2') || {};
  ok(JSON.parse(c2.depois || '{}').cancelado === '1' && JSON.parse(c2.antes || '{}').cancelado === '0' && JSON.parse(c2.depois || '{}').motivoCancel === 'erro de digitação', 'auditoria do cancelamento (antes 0, depois 1, motivo)', c2);

  console.log('6) Cadastro do PCE de outro servidor: com a permissão o autor fica; sem ela segue como era (comum), mas fica registrado');
  r = await sync(gestor.token, { cadastrosPce: [cadastro('cg1', 1, { propriedade: 'Sitio Renomeado Ficticio', atualizadoEm: agora + 6000 })] });
  ok(r.ok && !(r.recusados.cadastrosPce || []).length, 'gestora edita o Cadastro da autora', r.recusados);
  let c = (await lerAba('CadastrosPCE')).find(x => x.id === 'cg1');
  ok(c.propriedade === 'Sitio Renomeado Ficticio' && c.usuario === autora.nome, 'Cadastro alterado e o autor é o mesmo', c.usuario);
  h = await hist(); const hc = h.find(x => x.tabela === 'CadastrosPCE') || {};
  ok(hc.usuarioId === gestor.usuario.id && JSON.parse(hc.antes).propriedade === 'Sitio Gerenciar Ficticio' && JSON.parse(hc.depois).propriedade === 'Sitio Renomeado Ficticio', 'auditoria do Cadastro: antes e depois', hc);
  r = await sync(leitor.token, { cadastrosPce: [cadastro('cg1', 1, { propriedade: 'Sitio Da Leitora Ficticio', atualizadoEm: agora + 7000 })] });
  ok(r.ok && !(r.recusados.cadastrosPce || []).length, 'a leitora segue podendo atualizar o Cadastro (cadastro comum, como antes)', r.recusados);
  const hl = (await hist()).filter(x => x.tabela === 'CadastrosPCE' && x.usuarioId === leitor.usuario.id);
  ok(hl.length === 1 && JSON.parse(hl[0].depois).propriedade === 'Sitio Da Leitora Ficticio', 'e a edição dela também fica na auditoria', hl);

  console.log('7) o TF de Barreira não muda: continua só do autor, mesmo com a permissão');
  r = await sync(autora.token, { tfs: [TF('tfg1', 1)] });
  ok(r.ok && !(r.recusados.tfs || []).length, 'a autora grava o TF');
  r = await sync(gestor.token, { tfs: [TF('tfg1', 1, { nome: 'Nome Alterado Indevido', atualizadoEm: agora + 9000 })] });
  ok(r.ok && (r.recusados.tfs || []).includes('tfg1'), 'gestora (com a permissão) não altera o TF de outro servidor', r.recusados);
  ok((await lerAba('TFs')).find(x => x.id === 'tfg1').nome === 'Fulano Ficticio Teste', 'o TF continua como estava');
  r = await post({ action: 'tfEmitir', key: gestor.token, tf: TF('tfg1', 1, { nome: 'Nome Alterado Indevido', atualizadoEm: agora + 9500 }) });
  ok(!r.ok && /outro servidor/.test(r.erro || '') || r.emitido === false, 'tfEmitir de TF alheio também continua recusado', r.erro || r);
  ok((await hist()).every(x => x.tabela !== 'TFs'), 'nada de TF na auditoria do PCE');

  console.log('8) rótulo: "Gerenciar termos realizados" no painel e nos manuais; o nome interno da permissão não muda');
  const web = f => fs.readFileSync(path.join(amb.RAIZ, 'web', f), 'utf8');
  ok(/digitarDoPapel: 'Gerenciar termos realizados'/.test(web('painel/js/painel-usuarios.js')), 'painel: rótulo da permissão digitarDoPapel');
  ok(!/Digitar do papel/.test(web('painel/js/painel-usuarios.js')) && !/Digitar do papel/.test(web('painel/manual.html')) && !/Digitar do papel/.test(web('manual.html')), 'sem "Digitar do papel" visível no painel nem nos manuais');
  ok(/antigo: 'Gerenciar termos realizados'/.test(web('js/sync.js')), 'app: nome do módulo "antigo" nos avisos de permissão');
  const g = await U.gerente();
  const us = await post({ action: 'usuarioPermissoes', key: g.token, usuarioId: gestor.usuario.id, permissoes: U.lista({ veiculos: 1, tf: 1, pce: 1, antigo: 1 }) });
  ok(us.ok && us.permissoes.includes('digitarDoPapel'), 'o nome interno digitarDoPapel segue valendo na planilha', us.permissoes);
  console.log(falhas ? `FALHOU=${falhas}` : 'FALHOU=0');
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('  ✗ erro: ' + (e.stack || e)); process.exitCode = 1; });
