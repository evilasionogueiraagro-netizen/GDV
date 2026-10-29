/* ---------- Menu da planilha (dono da planilha): só colhe a entrada; a regra fica nos outros .gs ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('e-GDV')
    .addItem('Definir último nº de TF usado (barreira)', 'menuDefinirSequencia')
    .addItem('Auditar numeração de TF (lacunas e duplicidades)', 'menuAuditarNumeracao')
    .addItem('Definir último nº de Auto de infração usado (barreira)', 'menuDefinirSequenciaAuto')
    .addItem('Definir último nº de Termo de Colheita (PCE)', 'menuDefinirSequenciaPce')
    .addItem('Auditar numeração de Termo de Colheita (PCE)', 'menuAuditarNumeracaoPce')
    .addItem('Definir último nº de Termo de Fiscalização (PCE)', 'menuDefinirSequenciaTermoPce')
    .addItem('Auditar numeração de Termo de Fiscalização e Cadastro (PCE)', 'menuAuditarNumeracaoDocPce')
    .addItem('Criar o primeiro gerente', 'menuCriarGerente')
    .addItem('Redefinir senha de gerente', 'menuNovaSenhaGerente')
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

function menuDefinirSequenciaAuto() {
  const ui = SpreadsheetApp.getUi();
  const b = ui.prompt('Barreira', 'Código da barreira (coluna id da aba Barreiras), ex.: BVA-CEASA', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const a = ui.prompt('Ano', 'Ano da numeração (ex.: ' + new Date().getFullYear() + ')', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const u = ui.prompt('Último número usado', 'Último nº de Auto de infração JÁ usado nessa barreira/ano (o próximo será este + 1). Use 0 para começar do 0001.', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  try { const n = definirSequencia_(b.getResponseText().trim(), Number(a.getResponseText()), Number(u.getResponseText()), 'AI'); ui.alert('Pronto', 'O próximo Auto de infração será o nº ' + (n + 1) + '.', ui.ButtonSet.OK); }
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

/* ----- Login com matrícula e senha: o menu só colhe a entrada; a regra está em usuarios.gs ----- */

/** Cria o primeiro gerente (só quando não há gerente ativo): todas as permissões e uma senha provisória, mostrada uma vez. */
function menuCriarGerente() {
  const ui = SpreadsheetApp.getUi();
  const m = ui.prompt('Criar o primeiro gerente', 'Matrícula (3 a 20 letras, números, ponto ou hífen). Deixe em branco para o sistema gerar (GDV0001...):', ui.ButtonSet.OK_CANCEL);
  if (m.getSelectedButton() !== ui.Button.OK) return;
  const n = ui.prompt('Criar o primeiro gerente', 'Nome completo (como deve aparecer nos documentos):', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  try {
    const r = criarGerente_(m.getResponseText(), n.getResponseText());
    ui.alert('Gerente criado: ' + r.usuario.nome, 'Matrícula: ' + r.usuario.matricula + '\nSenha provisória: ' + r.senhaProvisoria +
      '\n\nEla aparece só agora. Entregue à pessoa: a troca é obrigatória no primeiro acesso. As demais contas o gerente cria no painel.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível criar', String(e.message || e), ui.ButtonSet.OK); }
}

/** Nova senha provisória para um gerente que esqueceu a senha; encerra as sessões dele. Os demais: a gerência, no painel. */
function menuNovaSenhaGerente() {
  const ui = SpreadsheetApp.getUi();
  const m = ui.prompt('Redefinir senha de gerente', 'Matrícula do gerente:', ui.ButtonSet.OK_CANCEL);
  if (m.getSelectedButton() !== ui.Button.OK) return;
  try {
    const r = novaSenhaGerente_(m.getResponseText());
    ui.alert('Nova senha para ' + r.usuario.nome, 'Matrícula: ' + r.usuario.matricula + '\nSenha provisória: ' + r.senhaProvisoria +
      '\n\nEla aparece só agora. As sessões abertas dessa pessoa foram encerradas; a troca é obrigatória no próximo acesso.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('Não foi possível gerar', String(e.message || e), ui.ButtonSet.OK); }
}
