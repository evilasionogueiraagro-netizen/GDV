/* ---------- Menu da planilha (administrador) ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('e-GDV')
    .addItem('Gerar código de ativação', 'menuGerarCodigo')
    .addItem('Gerar código de administrador (painel)', 'menuGerarCodigoAdmin')
    .addItem('Definir último nº de TF usado (barreira)', 'menuDefinirSequencia')
    .addItem('Auditar numeração de TF (lacunas e duplicidades)', 'menuAuditarNumeracao')
    .addItem('Definir último nº de Termo de Colheita (PCE)', 'menuDefinirSequenciaPce')
    .addItem('Auditar numeração de Termo de Colheita (PCE)', 'menuAuditarNumeracaoPce')
    .addItem('Definir último nº de Termo de Fiscalização (PCE)', 'menuDefinirSequenciaTermoPce')
    .addItem('Auditar numeração de Termo de Fiscalização e Cadastro (PCE)', 'menuAuditarNumeracaoDocPce')
    .addItem('Revogar acesso de um fiscal ou administrador', 'menuRevogar')
    .addItem('Criar gerente', 'menuCriarGerente')
    .addItem('Nova senha provisória', 'menuNovaSenhaProvisoria')
    .addItem('Criar contas em lote', 'menuCriarContasEmLote')
    .addItem('Autorizar acesso ao Drive (fotos do PCE)', 'menuAutorizarDrive')
    .addSeparator()
    .addItem('Ativar rotinas automáticas', 'menuAtivarRotinas')
    .addItem('Desativar rotinas automáticas', 'menuDesativarRotinas')
    .addItem('Fazer backup agora', 'menuBackupAgora')
    .addItem('Arquivar anos antigos agora', 'menuArquivarAgora')
    .addItem('Definir e-mails do relatório mensal', 'menuEmailsRelatorio')
    .addItem('Enviar relatório do mês passado agora', 'menuEnviarRelatorio')
    .addToUi();
}

/** Cria os gatilhos (uma vez; não duplica). Rodar pelo DONO da planilha: o Google pede autorização (gatilhos, Drive e envio de e-mail). */
function menuAtivarRotinas() {
  const ui = SpreadsheetApp.getUi();
  try {
    const r = ativarRotinasAutomaticas_();
    ui.alert('Rotinas automáticas ativas', r.ativas.map(function (n) { return '• ' + n; }).join('\n') +
      (r.criadas.length ? '' : '\n\n(Já estavam ativas: nada foi duplicado.)') +
      '\n\nBackups na pasta "' + BACKUP_PASTA + '" e arquivos anuais na pasta "' + ARQ_PASTA + '" do seu Drive. Relatório para: ' + (destinatariosRelatorio_().join(', ') || '(ninguém)') + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível ativar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuDesativarRotinas() {
  const ui = SpreadsheetApp.getUi();
  try {
    const n = desativarRotinasAutomaticas_();
    ui.alert('Rotinas automáticas desativadas', n + ' gatilho(s) removido(s). Turnos esquecidos abertos deixam de ser encerrados sozinhos e não há mais backup diário, relatório mensal nem arquivamento anual automático (o menu "Arquivar anos antigos agora" continua funcionando).', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível desativar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuBackupAgora() {
  const ui = SpreadsheetApp.getUi(), r = backupDiario();
  if (r.ok) ui.alert('Backup feito', r.nome + ' na pasta "' + BACKUP_PASTA + '" do seu Drive.' + (r.apagados ? '\n' + r.apagados + ' cópia(s) antiga(s) foram para a lixeira.' : ''), ui.ButtonSet.OK);
  else ui.alert('Não foi possível fazer o backup', r.erro, ui.ButtonSet.OK);
}

/** Arquivamento anual na hora (mesmo com as rotinas desativadas). Mostra quantas linhas saíram de cada aba e os links dos arquivos. */
function menuArquivarAgora() {
  const ui = SpreadsheetApp.getUi(), r = arquivarAnosAntigos_({ manual: true });
  if (!r.ok) { ui.alert('Não foi possível arquivar', r.erro, ui.ButtonSet.OK); return; }
  if (r.nada) { ui.alert('Nada a arquivar', 'A planilha só tem dados de ' + (anoAtualManaus_() - 1) + ' e ' + anoAtualManaus_() + ' (ou turnos ainda abertos).', ui.ButtonSet.OK); return; }
  const linhas = Object.keys(r.porAba).map(function (aba) {
    return '• ' + aba + ': ' + Object.keys(r.porAba[aba]).sort().map(function (ano) { return r.porAba[aba][ano] + ' linha(s) de ' + ano; }).join(', ');
  });
  ui.alert(r.incompleto ? 'Arquivamento em andamento' : 'Arquivamento concluído',
    (linhas.join('\n') || 'Nenhuma linha movida.') + '\n\nArquivos (pasta "' + ARQ_PASTA + '" do seu Drive):\n' +
    r.arquivos.map(function (a) { return ARQ_PREFIXO + a.ano + ': ' + a.url; }).join('\n') +
    (r.incompleto ? '\n\nO tempo da execução acabou: rode de novo para continuar (o gatilho diário também continua sozinho).' : '') +
    (r.backup && r.backup.ok ? '\n\nBackup feito antes: ' + r.backup.nome + '.' : ''), ui.ButtonSet.OK);
}

function menuEmailsRelatorio() {
  const ui = SpreadsheetApp.getUi(), atual = PropertiesService.getScriptProperties().getProperty('RELATORIO_EMAILS') || '';
  const r = ui.prompt('E-mails do relatório mensal', 'Separe por vírgula. Deixe em branco para enviar só ao dono da planilha.\nAtual: ' +
    (atual || destinatariosRelatorio_().join(', ') + ' (padrão)'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try { ui.alert('Pronto', 'O relatório mensal vai para: ' + definirEmailsRelatorio_(r.getResponseText()).join(', '), ui.ButtonSet.OK); }
  catch (e) { ui.alert('Não foi possível salvar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuEnviarRelatorio() {
  const ui = SpreadsheetApp.getUi();
  try { const r = relatorioMensal(); ui.alert('Relatório enviado', r.assunto + '\nPara: ' + r.para.join(', '), ui.ButtonSet.OK); }
  catch (e) { ui.alert('Não foi possível enviar', String(e.message || e), ui.ButtonSet.OK); }
}

/** Pede a autorização do Google Drive (fotos/assinaturas do PCE) e cria a pasta "GDV - Arquivos". Depois, publique uma NOVA versão da implantação. */
function menuAutorizarDrive() {
  const ui = SpreadsheetApp.getUi();
  try {
    const p = pastaArquivos_();
    ui.alert('Drive autorizado', 'Pasta das fotos: ' + p.getName() + '\n' + p.getUrl() +
      '\n\nAgora publique uma NOVA versão da implantação (Implantar → Gerenciar implantações → Editar → Nova versão) para os aparelhos enviarem as fotos.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível acessar o Drive', String(e.message || e), ui.ButtonSet.OK); }
}

function menuGerarCodigo() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Gerar código de ativação', 'Nome COMPLETO do fiscal (como deve aparecer nos documentos):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    const g = gerarCodigo_(r.getResponseText());
    const venc = Utilities.formatDate(new Date(g.expiraEm), 'America/Manaus', 'dd/MM/yyyy HH:mm');
    ui.alert('Código para ' + g.nome, g.codigo.slice(0, 3) + ' ' + g.codigo.slice(3) + '\n\nEnvie ao fiscal. Uso único, válido até ' + venc + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuGerarCodigoAdmin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Código de administrador (painel)', 'Nome do administrador:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    const g = gerarCodigo_(r.getResponseText(), 'admin');
    const venc = Utilities.formatDate(new Date(g.expiraEm), 'America/Manaus', 'dd/MM/yyyy HH:mm');
    ui.alert('Código de administrador para ' + g.nome, g.codigo.slice(0, 3) + ' ' + g.codigo.slice(3) + '\n\nAbra o painel em ' + painelUrl_() + ' e digite o código. Uso único, válido até ' + venc + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuDefinirSequencia() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Barreira', 'Código da barreira (coluna id da aba Barreiras), ex.: BVA-CEASA', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const u = ui.prompt('Último número usado', 'Último nº de TF JÁ usado nessa barreira/ano (o próximo será este + 1). Use 0 para começar do 0001.', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  try { const n = definirSequencia_(b.getResponseText().trim(), Number(a.getResponseText()), Number(u.getResponseText())); ui.alert('Pronto', 'O próximo TF será o nº ' + (n + 1) + '.', ui.ButtonSet.OK); }
  catch (e) { ui.alert('Não foi possível definir', String(e.message || e), ui.ButtonSet.OK); }
}

function menuAuditarNumeracao() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Barreira', 'Código da barreira (coluna id da aba Barreiras), ex.: BVA-CEASA', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const r = auditarSequencia_(b.getResponseText().trim(), Number(a.getResponseText()));
  const f = function (l) { return l.length ? l.join(', ') : 'nenhuma'; };
  ui.alert('Auditoria da numeração', r.total + ' TF(s), do nº ' + r.primeiro + ' ao nº ' + r.ultimo + '.\n\nLacunas (números sem TF): ' + f(r.lacunas) +
    '\nNúmeros repetidos: ' + (r.duplicados.length ? r.duplicados.map(function (d) { return d.numero; }).join(', ') : 'nenhum') +
    '\nNúmeros alterados à mão ou provisórios: ' + (r.editados.length ? r.editados.map(function (e) { return e.numero + ' (' + e.origem + ', ' + e.usuario + ')'; }).join('; ') : 'nenhum'), ui.ButtonSet.OK);
}

function menuDefinirSequenciaPce() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Unidade', 'Unidade da numeração do Termo de Colheita (lotação do servidor), ex.: MANAUS', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const u = ui.prompt('Último número usado', 'Último nº de Termo de Colheita JÁ usado nessa unidade/ano (o próximo será este + 1). Use 0 para começar do 001.', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  try {
    const un = unidadePce_(b.getResponseText()), ano = Number(a.getResponseText());
    const n = definirSequencia_(un, ano, Number(u.getResponseText()), 'PCE');
    ui.alert('Pronto', 'O próximo Termo de Colheita será o nº ' + numeroTxtPce_(n + 1, ano, un) + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível definir', String(e.message || e), ui.ButtonSet.OK); }
}

function menuAuditarNumeracaoPce() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Unidade', 'Unidade da numeração do Termo de Colheita, ex.: MANAUS', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const r = auditarSequencia_(b.getResponseText(), Number(a.getResponseText()), 'PCE');
  const f = function (l) { return l.length ? l.join(', ') : 'nenhuma'; };
  ui.alert('Auditoria da numeração (Termo de Colheita)', r.total + ' termo(s), do nº ' + r.primeiro + ' ao nº ' + r.ultimo + '.\n\nLacunas (números sem termo): ' + f(r.lacunas) +
    '\nNúmeros repetidos: ' + (r.duplicados.length ? r.duplicados.map(function (d) { return d.numero; }).join(', ') : 'nenhum') +
    '\nNúmeros alterados à mão ou provisórios: ' + (r.editados.length ? r.editados.map(function (e) { return e.numero + ' (' + e.origem + ', ' + e.usuario + ')'; }).join('; ') : 'nenhum'), ui.ButtonSet.OK);
}

function menuDefinirSequenciaTermoPce() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Unidade', 'Unidade da numeração do Termo de Fiscalização do PCE, ex.: AUTAZES', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const u = ui.prompt('Último número usado', 'Último nº de Termo de Fiscalização JÁ usado nessa unidade/ano (o próximo será este + 1). Use 0 para começar do 001.', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  try {
    const un = unidadePce_(b.getResponseText()), ano = Number(a.getResponseText());
    const n = definirSequencia_(un, ano, Number(u.getResponseText()), 'TPCE');
    ui.alert('Pronto', 'O próximo Termo de Fiscalização será o nº ' + numeroTxtDocPce_('termo', n + 1, ano, un) + '.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível definir', String(e.message || e), ui.ButtonSet.OK); }
}

function menuAuditarNumeracaoDocPce() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Unidade', 'Unidade da numeração, ex.: AUTAZES', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const un = unidadePce_(b.getResponseText()), ano = Number(a.getResponseText());
  const f = function (l) { return l.length ? l.join(', ') : 'nenhuma'; };
  const txt = function (r, nome) {
    return nome + ': ' + r.total + ' registro(s), do nº ' + r.primeiro + ' ao nº ' + r.ultimo + '.\nLacunas: ' + f(r.lacunas) +
      '\nNúmeros repetidos: ' + (r.duplicados.length ? r.duplicados.map(function (d) { return d.numero; }).join(', ') : 'nenhum') +
      '\nDo papel, editados ou provisórios: ' + (r.editados.length ? r.editados.map(function (e) { return e.numero + ' (' + e.origem + ', ' + e.usuario + ')'; }).join('; ') : 'nenhum');
  };
  const t = auditarRegs_('TPCE', un, ano, lerLeitura_('TermosPCE'), lerLeitura_('Numeracao'));
  const c = auditarRegs_('CPCE', 'MONILIASE|' + un, ano, lerLeitura_('CadastrosPCE'), lerLeitura_('Numeracao'));
  ui.alert('Auditoria da numeração (PCE)', txt(t, 'Termos de Fiscalização') + '\n\n' + txt(c, 'Cadastros de imóvel (monilíase)'), ui.ButtonSet.OK);
}

function menuRevogar() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Revogar acesso', 'Nome COMPLETO do fiscal (igual ao cadastrado na aba Fiscais):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const n = revogar_(r.getResponseText());
  ui.alert(n ? 'Acesso revogado em ' + n + ' aparelho(s)/código(s).' : 'Nenhum acesso ativo encontrado com esse nome.');
}

/* ----- Login com matrícula e senha: o menu só colhe a entrada; a regra está em usuarios.gs ----- */

/** Cria o primeiro gerente (ou outro): todas as permissões e uma senha provisória, mostrada uma vez. */
function menuCriarGerente() {
  const ui = SpreadsheetApp.getUi();
  const m = ui.prompt('Criar gerente', 'Matrícula (3 a 20 letras, números, ponto ou hífen). Deixe em branco para o sistema gerar (GDV0001...):', ui.ButtonSet.OK_CANCEL);
  if (m.getSelectedButton() !== ui.Button.OK) return;
  const n = ui.prompt('Criar gerente', 'Nome completo (como deve aparecer nos documentos):', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  try {
    const r = criarGerente_(m.getResponseText(), n.getResponseText());
    ui.alert('Gerente criado: ' + r.usuario.nome, 'Matrícula: ' + r.usuario.matricula + '\nSenha provisória: ' + r.senhaProvisoria +
      '\n\nEla aparece só agora. Entregue à pessoa: a troca é obrigatória no primeiro acesso.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível criar', String(e.message || e), ui.ButtonSet.OK); }
}

/** Nova senha provisória para qualquer usuário (inclusive gerente que esqueceu a senha); encerra as sessões dele. */
function menuNovaSenhaProvisoria() {
  const ui = SpreadsheetApp.getUi();
  const m = ui.prompt('Nova senha provisória', 'Matrícula do usuário:', ui.ButtonSet.OK_CANCEL);
  if (m.getSelectedButton() !== ui.Button.OK) return;
  try {
    const r = novaSenhaProvisoria_(m.getResponseText());
    ui.alert('Nova senha para ' + r.usuario.nome, 'Matrícula: ' + r.usuario.matricula + '\nSenha provisória: ' + r.senhaProvisoria +
      '\n\nEla aparece só agora. As sessões abertas dessa pessoa foram encerradas; a troca é obrigatória no próximo acesso.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}

function menuCriarContasEmLote() {
  const ui = SpreadsheetApp.getUi();
  const c = ui.alert('Criar contas em lote', 'Lê a aba ContasParaCriar (colunas matricula, nome e permissoes, separadas por vírgula; matrícula em branco = gerada pelo sistema), ' +
    'cria uma conta por linha e escreve a senha provisória de cada uma na coluna senhaProvisoria da própria aba.\n\nContinuar?', ui.ButtonSet.OK_CANCEL);
  if (c !== ui.Button.OK) return;
  try {
    const r = contasEmLoteDaPlanilha_();
    ui.alert('Contas criadas', r.criadas + ' conta(s) criada(s)' + (r.falhas ? ', ' + r.falhas + ' com erro (veja a coluna resultado)' : '') +
      (r.puladas ? ', ' + r.puladas + ' já criada(s) antes (ignorada(s))' : '') + '.\n\nEntregue as senhas provisórias e depois APAGUE a aba ContasParaCriar: ' +
      'as senhas estão nela em texto. A troca é obrigatória no primeiro acesso.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível criar', String(e.message || e), ui.ButtonSet.OK); }
}

/**
 * Lê a aba ContasParaCriar, cria as contas (criarContasEmLote_) e escreve a senha provisória e o resultado de cada linha nas colunas
 * senhaProvisoria e resultado da própria aba (criadas se faltarem). Linha com senhaProvisoria já preenchida foi criada antes: é ignorada.
 * Devolve {criadas, falhas, puladas}.
 */
function contasEmLoteDaPlanilha_() {
  const sh = planilha_().getSheetByName('ContasParaCriar');
  if (!sh || sh.getLastRow() < 2) throw new Error('Crie a aba ContasParaCriar com as colunas matricula, nome e permissoes (separadas por vírgula) e uma conta por linha.');
  const cab = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (c) { return String(c).trim(); });
  const col = function (nome) { return cab.indexOf(nome); };
  if (col('nome') < 0 || col('permissoes') < 0) throw new Error('A aba ContasParaCriar precisa das colunas matricula, nome e permissoes.');
  ['senhaProvisoria', 'resultado'].forEach(function (nome) { if (col(nome) < 0) cab.push(nome); });
  if (sh.getMaxColumns() < cab.length) sh.insertColumnsAfter(sh.getMaxColumns(), cab.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, cab.length).setValues([cab]);
  const iSenha = col('senhaProvisoria'), iRes = col('resultado'), n = sh.getLastRow() - 1;
  const linhas = sh.getRange(2, 1, n, cab.length).getValues().map(function (l) { const c = l.slice(); while (c.length < cab.length) c.push(''); return c; });
  const alvo = [], pos = [];
  let puladas = 0;
  linhas.forEach(function (l, i) {
    if (!String(l[col('nome')]).trim() && !String(col('matricula') >= 0 ? l[col('matricula')] : '').trim()) return;          // linha em branco
    if (String(l[iSenha]).trim()) { puladas++; return; }                                                                      // já criada antes
    alvo.push({ matricula: col('matricula') >= 0 ? l[col('matricula')] : '', nome: l[col('nome')], permissoes: String(l[col('permissoes')]) });
    pos.push(i);
  });
  const res = criarContasEmLote_(alvo);
  res.forEach(function (r, k) {
    const l = linhas[pos[k]];
    l[iSenha] = r.ok ? r.senhaProvisoria : '';
    l[iRes] = r.ok ? 'criada (matrícula ' + r.usuario.matricula + ')' : r.erro;
    if (r.ok && col('matricula') >= 0) l[col('matricula')] = r.usuario.matricula;                                            // mostra a matrícula gerada
  });
  sh.getRange(2, iSenha + 1, n, 1).setNumberFormat('@').setValues(linhas.map(function (l) { return [l[iSenha]]; }));
  sh.getRange(2, iRes + 1, n, 1).setValues(linhas.map(function (l) { return [l[iRes]]; }));
  if (col('matricula') >= 0) sh.getRange(2, col('matricula') + 1, n, 1).setNumberFormat('@').setValues(linhas.map(function (l) { return [l[col('matricula')]]; }));
  return { criadas: res.filter(function (r) { return r.ok; }).length, falhas: res.filter(function (r) { return !r.ok; }).length, puladas: puladas };
}
