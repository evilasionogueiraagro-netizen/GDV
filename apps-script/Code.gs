/**
 * e-GDV – Controle de Veículos (Barreira Fitossanitária)
 * API de sincronização: recebe registros do app (offline-first), grava na planilha
 * e devolve o que mudou desde a última sincronização.
 *
 * Acesso: todos entram com matrícula e senha (usuarios.gs; action `entrar`), com permissões por app e por módulo do campo
 * (abas Usuarios, PermissoesDosUsuarios, SessoesDosUsuarios, HistoricoDeAlteracoes). Toda action autenticada confere o token na
 * planilha a cada chamada. As abas Fiscais, Permissoes, Administrativo e AdmSessoes ficam só como histórico (não valem como credencial).
 * Regras: docs/modulos/acessos.md; actions: docs/API.md.
 */

const TABELAS = {
  Turnos: ['id', 'numeroTF', 'data', 'letra', 'inicio', 'fim', 'fiscal', 'local', 'unidade', 'posto',
           'encerrado', 'criadoEm', 'atualizadoEm', 'srv_ts',
           'latIni', 'lngIni', 'precIni', 'latFim', 'lngFim', 'precFim', 'usuario', 'semPlaca',   // colunas novas ficam sempre no fim (semPlaca=1: placa opcional no turno)
           'encerradoPor', 'encerradoEm',    // turno encerrado fora do aparelho: nome do administrador (painel) ou "Automático (12 h)", e quando (ms)
           'importacao',                     // turno criado pela importação do relatório de plantão do papel (portal): id da importação
           'pessoasEducacao', 'soPessoas',   // turno que não conta veículos (soPessoas = 1; ex.: volante de Tabatinga, educação sanitária da monilíase):
                                             // pessoas orientadas contadas no próprio turno
           'colegas',                        // fiscais que entraram no turno com o próprio login pelo código do dono (JSON [nomes]); só o servidor grava
           'registroAntigo', 'pdfs',         // turno digitado do papel (turnos-do-papel.gs): registroAntigo = 1, pdfs = JSON [ids] do Termo escaneado
           'cancelado', 'canceladoEm'],      // turno aberto por engano e cancelado no app (sem TF): fica na planilha, fora de painel e relatórios
  Veiculos: ['id', 'turnoId', 'hora', 'placa', 'tipo', 'pessoas', 'obs',
             'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
             // ufOrigem/ufDestino: "Origem e destino (opcional)" do formulário do veículo (sigla de CONFIG.ufs ou "Exterior"; vazio = não
             // informado) — entram no VIGIFITO (internalização / cargas para outros estados) quando o veículo não tem TF ligado.
             // HISTÓRICO (o formulário não grava mais; não entram mais em nenhum cálculo; colunas mantidas pelos dados antigos):
             // semEducacao, medidaFito, carga, produtos (JSON ["PRODUTO - 10 Kg", …]), partida, inspecaoFito, docConferido
             'semEducacao', 'medidaFito', 'carga', 'produtos', 'ufOrigem', 'ufDestino', 'partida', 'inspecaoFito', 'docConferido',
             // município de origem/destino: cidade digitada no registro do veículo (app) ou do relatório de plantão do papel importado
             // no portal (admPlantaoImportar). Só do papel (o app não grava): transportador, carga (JSON [{p, q, u}], como os produtos do TF), medida (liberacao | apreensao), nº do TF do papel,
             // documento apresentado e o id da importação. Carga com nº do TF conta no VIGIFITO como o TF de barreira (motorBarreira_).
             'origemMun', 'destinoMun', 'transportador', 'cargaPapel', 'medidaPapel', 'tfPapel', 'docPapel', 'importacao',
             // alerta de cuidado (app): cuidado = 1 → outros fiscais veem "Cuidado ao abordar este veículo" ao digitar a placa (índice
             // tfIndiceReincidencia); cuidadoMotivo = alteracao | resistencia | ameaca | outro (detalhes nas observações)
             'cuidado', 'cuidadoMotivo'],
  // HISTÓRICO (não vale mais como credencial): códigos de ativação e credenciais antigas dos fiscais e administradores.
  // Os nomes ainda servem à lista de servidores das diárias do portal (admServidores_).
  Fiscais: ['nome', 'codigo', 'expiraEm', 'ativo', 'token', 'ativadoEm', 'perfil',
            'geradoPor',
            'oculto', 'ocultoPor', 'ocultoEm'],
  // Termos de Fiscalização de Barreira (TF)
  TFs: ['id', 'barreira', 'ano', 'numero', 'numeroTxt', 'turnoId', 'veiculoId', 'data', 'hora', 'fiscal', 'local', 'placa', 'origem', 'destino',
        'doc', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'relacao', 'inspecao', 'coleta', 'amostras',
        'procedimento', 'fiel', 'auto', 'advertencia', 'documentos', 'produtos', 'constatacao', 'enquadramento',
        'reincidente', 'tfsAnteriores', 'cancelado', 'motivoCancel', 'conflito', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
        'numeroSugerido', 'numeroOrigem', 'emitidoEm',   // auditoria da numeração (colunas novas ficam sempre no fim)
        'fotos', 'assinaturas', 'recusaAssinatura',    // fotos = JSON [ids]; assinaturas = JSON {fiscalizado, servidor} (ids na aba Arquivos); recusaAssinatura = 1: fiscalizado se recusou
        'ufOrigem', 'ufDestino',                      // UF de origem/destino da carga (sigla de UFS_ ou "Exterior"; vazio = não informada; TF antigo: ufDoTexto_ de origem/destino)
        'registroAntigo', 'pdfs'],                    // TF digitado do papel (Digitar do papel): registroAntigo = 1, pdfs = JSON [ids] dos PDFs escaneados (aba Arquivos)
  Pessoas: ['id', 'tipo', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
            'email'],                                                                                                              // id = CPF/CNPJ (só dígitos)
  Placas: ['id', 'doc', 'nome', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],                                                    // id = placa
  Barreiras: ['id', 'nome', 'sufixo', 'local', 'ativo'],                                                                            // cadastro feito direto na planilha
  Numeracao: ['id', 'barreira', 'ano', 'ultimo', 'atualizadoEm'],                                                                    // ponto de partida definido pelo administrador (id = barreira|ano)
  Consultas: ['em', 'usuario', 'doc', 'placa', 'resultado'],
  // Módulo PCE: Levantamento fitossanitário e Termo de Colheita de Amostras
  Levantamentos: ['id', 'data', 'hora', 'servidor', 'cargo', 'matricula', 'lotacao', 'doc', 'nome', 'telefone', 'email',
                  'propriedade', 'codigoPropriedade', 'situacaoFundiaria', 'municipio', 'lat', 'lon', 'precisao',
                  'culturas', 'fotos', 'assinaturas', 'obs', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
                  'registroAntigo', 'documentos',   // registroAntigo=1: digitado do papel (só para o app reabrir no formulário certo); documentos = PDFs (JSON de ids)
                  'pragas',    // pragas = JSON [{praga, culturas:[{cultura, area, espLinha, espPlanta, resultado, coleta, tipoMaterial, codigoAmostra, destinoAmostra, fotos:[ids]}]}]
                               // (levantamento por praga/doença). culturas/fotos continuam preenchidos (derivados) para registros e relatórios antigos.
                  'tipoLocal', 'origemVisita',   // dados gerais da visita (opcionais; texto da lista CONFIG.PCE.tiposLocal/origensVisita ou o digitado em "Outro")
                  'citros',    // cadastro de cítricos (IN 21/2018, Portaria 317/2021): JSON normalizado por citrosTexto_; vazio sem praga de citros
                  'cnpj', 'empresa', 'endereco', 'uf'],   // identificação do produtor/propriedade (CNPJ só dígitos, empresa/nome fantasia, endereço, UF): identLev_
  Colheitas: ['id', 'unidade', 'ano', 'numero', 'numeroTxt', 'numeroSugerido', 'numeroOrigem', 'conflito', 'emitidoEm', 'levantamentoId',
              'data', 'hora', 'servidor', 'cargo', 'matricula', 'lotacao', 'municipio', 'doc', 'nome', 'endereco', 'lat', 'lon', 'precisao',
              'cultura', 'quantidade', 'analise', 'partes', 'descricao', 'fotos', 'testemunha1Nome', 'testemunha1Doc', 'testemunha2Nome',
              'testemunha2Doc', 'assinaturas', 'local', 'cancelado', 'motivoCancel', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
              'registroAntigo', 'documentos',
              'laboratorio'],   // resultado laboratorial (JSON {laboratorio, laboratorioOutro, envio, laudo, dataResultado, resultado, praga, obs, atualizadoEm, por});
                                // registrado depois (app ou painel → painelPceLaudo); o sync mescla pelo atualizadoEm do resultado (nunca apaga um mais novo)
  Propriedades: ['id', 'codigo', 'nome', 'doc', 'municipio', 'situacaoFundiaria', 'lat', 'lon', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
                 'cnpj', 'viaAcesso', 'comercial', 'tipoPropriedade', 'endereco', 'uf',   // campos comuns do Cadastro de imóvel (PCE): CNPJ, via de acesso, propriedade comercial (sim/nao) e tipo
                 'empresa'],   // empresa / nome fantasia (levantamento e Termo de Fiscalização do PCE)
  // Cadastro de imóvel do PCE (1x por propriedade e programa: monilíase e citros). Numeração por programa + unidade + ano ("001-2026-AUTAZES").
  // dados = JSON com os campos do programa (monilíase: culturas/plantas, informações fitossanitárias, levantamento de detecção…; citros: o bloco
  // "Cultura do citros" do levantamento + levantamentoId, codigoPropriedade, endereco, telefone, empresa, culturasAvaliadas); totalPlantas = soma das plantas.
  CadastrosPCE: ['id', 'programa', 'unidade', 'ano', 'numero', 'numeroTxt', 'numeroSugerido', 'numeroOrigem', 'conflito', 'emitidoEm', 'propriedadeId',
                 'doc', 'nome', 'propriedade', 'cnpj', 'data', 'hora', 'municipio', 'uf', 'lat', 'lon', 'servidor', 'cargo', 'matricula', 'lotacao', 'local',
                 'dados', 'totalPlantas', 'fotos', 'assinaturas', 'documentos', 'registroAntigo', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  // Termo de Fiscalização do PCE (1 por visita; NÃO é o TF de Barreira). Numeração por unidade + ano ("001.2026.AUTAZES").
  // pragas/acoes/tipoLocal/testemunhas = JSON (programa "citros": tipoLocal = [o local especificado, "ao realizar fiscalização no(a)…"]);
  // plantasInspecionadas, amostra e sintomas (sim/nao) alimentam o Relatório de atividades
  // (folders/flyers da Educação Sanitária não são anotados por visita: são digitados na geração do relatório); hospedeiros = JSON das culturas do cadastro com plantas (copiado ao salvar).
  TermosPCE: ['id', 'unidade', 'ano', 'numero', 'numeroTxt', 'numeroSugerido', 'numeroOrigem', 'conflito', 'emitidoEm', 'propriedadeId', 'cadastroId', 'programa',
              'doc', 'nome', 'atividade', 'empresa', 'cnpj', 'atividadeEmpresa', 'endereco', 'municipio', 'uf', 'telefone', 'lat', 'lon', 'data', 'hora',
              'servidor', 'cargo', 'matricula', 'lotacao', 'pragas', 'tipoLocal', 'acoes', 'constatacao', 'enquadramento', 'testemunhas', 'recebidoEm',
              'plantasInspecionadas', 'amostra', 'sintomas', 'hospedeiros', 'fotos', 'assinaturas', 'documentos', 'registroAntigo',
              'cancelado', 'motivoCancel', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Arquivos: ['id', 'dono', 'donoId', 'tipo', 'papel', 'nome', 'mime', 'tamanho', 'driveId', 'url', 'usuario', 'criadoEm',  // fotos/assinaturas/PDFs no Drive
             'rotulo'],   // rotulo = "praga – cultura" da foto do levantamento (vai também no nome do arquivo)
  // TF de Barreira em preenchimento no aparelho (alerta "apreensão em andamento" no painel). id = usuario|rascunhoId. Sem CPF/nome do fiscalizado.
  Andamento: ['id', 'usuario', 'fiscal', 'turnoId', 'placa', 'procedimento', 'local', 'barreira', 'lat', 'lon', 'estado', 'inicioTs', 'atualizadoTs'],
  // HISTÓRICO (não vale mais): módulos por nome do servidor. Hoje os módulos vêm de PermissoesDosUsuarios.
  Permissoes: ['nome', 'veiculos', 'tf', 'pce', 'atualizadoEm', 'atualizadoPor', 'antigo'],
  // Sinal de cada aparelho (heartbeat), atualizado a cada sincronização (inclusive sem nada a enviar) e pelo "ping" de erro.
  // id = uuid fixo do aparelho (versão antiga do app, sem sinal: "legado-" + início da credencial). pendentes = JSON {turnos, veiculos, ...}
  // (o que ainda está guardado sem enviar, já descontado o que chegou neste envio); turnosEncerradosPendentes = JSON [ids] (encerrados no
  // celular sem chegar à planilha); fimPendentes = JSON {id: "HH:MM"}; situacao = 'ok' (último contato foi um envio bem-sucedido) ou
  // 'erro' (último contato foi o aviso de uma falha); ultimoErro/ultimoErroEm = último erro relatado pelo aparelho (histórico).
  Aparelhos: ['id', 'usuario', 'versao', 'plataforma', 'standalone', 'online', 'ultimoSinal', 'pendentes', 'turnoAtual',
              'turnosEncerradosPendentes', 'fimPendentes', 'ultimoErro', 'ultimoErroEm', 'origem', 'situacao', 'cred', 'primeiroSinal'],
  // Convênios (aba "Convênios" do painel; só administrador). config = JSON do convênio (etapas, metas, sub-metas, plano de aplicação,
  // assinaturas e regras de apuração); sem linha = semente embutida no código (convSemente_).
  Convenios: ['id', 'config', 'atualizadoEm', 'atualizadoPor'],
  // Execução física lançada à mão: tipo execucao (etapas manuais), ajuste (+/− nas etapas automáticas, com justificativa) ou bem
  // (situação de um bem da etapa 1.1: submeta = id do bem). Exclusão lógica (excluido = 1). Sem dados pessoais.
  ConvLancamentos: ['id', 'convenio', 'etapa', 'submeta', 'data', 'municipio', 'quantidade', 'descricao', 'tipo', 'situacao', 'documento',
                    'usuario', 'criadoEm', 'atualizadoEm', 'excluido', 'armadilhas', 'propriedades',
                    'admId'],   // quem lançou no Portal do Administrativo (id da linha da aba Administrativo; o e-mail fica só lá)
  // Execução financeira (empenho/NF/PCDP/OB no campo documento; nunca CPF do favorecido). fonte = concedente | contrapartida.
  // Importados da planilha de movimentação (painelConvFinImportar): origem = 'planilha', chave = imp|convênio|item|memo (idempotência),
  // arquivo = nome do .xlsx e importadoEm = quando; lançados à mão: origem 'manual' (ou vazio nas linhas antigas).
  ConvFinanceiro: ['id', 'convenio', 'etapa', 'item', 'natureza', 'data', 'quantidade', 'valor', 'documento', 'descricao', 'fonte',
                   'usuario', 'criadoEm', 'atualizadoEm', 'excluido', 'chave', 'origem', 'arquivo', 'importadoEm',
                   // desembolso lançado no portal: tipo da diária (NM/NS/TERC), servidor que recebeu (id da lista de servidores e o NOME — o nome
                   // fica só aqui e no portal; o painel e os relatórios nunca recebem) e quem lançou (admId)
                   'tipoDiaria', 'servidorId', 'servidorNome', 'admId',
                   'municipio'],   // município do desembolso (opcional; lançado no portal)
  // Textos do relatório mensal (id = convenio|AAAA-MM): textos = JSON {etapas:{"1.4":{evidencias, justificativa, fator, providencia, situacao}},
  // gerais:{fatores, providencias, analise, conclusao}}
  ConvRelatorios: ['id', 'convenio', 'mes', 'numero', 'textos', 'usuario', 'atualizadoEm'],
  // Relatório GDV (painel → aba Relatórios; só administrador). Textos editáveis por relatório: id = "mensal|AAAA|MM" ou "anual|AAAA|"
  // (textos = JSON {introducao, ..., assinaturas, local}). Lançamentos manuais: UMA linha por mês e linha do quadro (id = "AAAA|MM|chave"):
  // valor numérico (quadros PCE/VIGIFITO, colunas manuais por município) ou lista = JSON (tabelas de CFO/CFOC, PTV e educação sanitária do mês).
  // O anual soma os meses. Quem/quando em cada linha (auditável na planilha).
  RelGdvTextos: ['id', 'tipo', 'ano', 'mes', 'textos', 'usuario', 'atualizadoEm'],
  RelGdvLancamentos: ['id', 'ano', 'mes', 'chave', 'valor', 'lista', 'usuario', 'atualizadoEm', 'admId'],
  // HISTÓRICO (não vale mais como credencial): pessoas liberadas no portal pelo código antigo. Os e-mails ficam SÓ nesta aba (LGPD).
  Administrativo: ['id', 'email', 'nome', 'ativo', 'criadoEm', 'criadoPor', 'ultimoAcesso', 'codigo', 'codigoExpira', 'atualizadoEm', 'atualizadoPor',
                   'oculto', 'ocultoPor', 'ocultoEm'],
  // HISTÓRICO (não vale mais): sessões do portal pelo código antigo (só o SHA-256 do token).
  AdmSessoes: ['id', 'hash', 'admId', 'origem', 'criadoEm', 'expiraEm', 'ultimoUso', 'revogado'],
  // Histórico de alterações feitas no portal (antes/depois em JSON).
  AdmHistorico: ['em', 'admId', 'nome', 'acao', 'aba', 'registro', 'antes', 'depois'],
  // VIGIFITO: configuração (postos e a escala dos períodos de 10 dias; sem linha = semente vigSemente_) e valores lançados por
  // posto × mês (periodo = AAAA-MM) ou por período de 10 dias (periodo = P<AAAA-MM-DD do início>). Uma linha por célula
  // (id = periodo|posto|indicador); substitui = 1: valor que substitui o apurado pelo e-GDV (com justificativa).
  VigConfig: ['id', 'config', 'atualizadoEm', 'atualizadoPor'],
  VigLancamentos: ['id', 'ano', 'periodo', 'posto', 'indicador', 'valor', 'substitui', 'justificativa', 'origem', 'arquivo', 'usuario', 'admId', 'atualizadoEm', 'excluido'],
  // Login com matrícula e senha (usuarios.gs). Nada é apagado: revogar = preencher revogadaEm/encerradaEm; desativar = ativo 0.
  // Usuarios: senhaHash = bcrypt (sal dentro do hash; senhaSal fica vazio, coluna do formato antigo) (a senha nunca é guardada); senhaProvisoria = 1: troca obrigatória no próximo acesso.
  // criadoPor/atualizadoPor = id do usuário ou "planilha" (menu da planilha).
  Usuarios: ['id', 'matricula', 'nome', 'senhaHash', 'senhaSal', 'senhaProvisoria', 'senhaAlteradaEm', 'ativo',
             'criadoEm', 'criadoPor', 'atualizadoEm', 'atualizadoPor'],
  // Uma linha por permissão concedida (campo, painel, administracao, gerencia e os módulos do campo); ativa = sem revogadaEm. Conceder de novo = linha nova.
  PermissoesDosUsuarios: ['id', 'usuarioId', 'permissao', 'concedidaEm', 'concedidaPor', 'revogadaEm', 'revogadaPor'],
  // Sessões do login novo: só o SHA-256 do token (o token em si fica no aparelho). Não expiram: até sair ou ser encerrada.
  SessoesDosUsuarios: ['id', 'usuarioId', 'tokenHash', 'aplicativo', 'aparelhoId', 'criadaEm', 'ultimoUso',
                       'encerradaEm', 'encerradaPor', 'motivoDoEncerramento'],
  // Toda mudança de acesso: quem, quando, o quê (antes/depois em JSON, nunca com hash de senha).
  HistoricoDeAlteracoes: ['id', 'em', 'usuarioId', 'acao', 'tabela', 'registroId', 'antes', 'depois'],
  // Turno compartilhado (turnos-compartilhados.gs): o dono do turno gera um código (válido por 15 min); o colega, com o próprio login,
  // entra com ele (colega/entrouEm) e sai quando quiser (saiuEm). Cada convite é uma linha; nada é apagado.
  Pareamentos: ['id', 'turnoId', 'dono', 'codigo', 'criadoEm', 'expiraEm', 'colega', 'entrouEm', 'saiuEm'],
  // escala de plantão por BVA e período (escalas.gs): fiscais = JSON [{id, nome}]; situacao = rascunho | publicada; excluir é lógico
  Escalas: ['id', 'bva', 'inicio', 'fim', 'fiscais', 'situacao', 'criadoEm', 'criadoPor', 'atualizadoEm', 'atualizadoPor', 'publicadaEm', 'publicadaPor', 'excluido'],
  // diárias das escalas no Portal do Administrativo: escala × fiscal (id = escalaId|usuarioId); situacao = pendente | concluida (PCDP)
  EscalaPcdp: ['id', 'escalaId', 'usuarioId', 'nome', 'situacao', 'pcdp', 'atualizadoEm', 'atualizadoPor', 'admId'],
  // BVAs cadastradas pela gerência no painel (bvas.gs): somam-se às de CONFIG.bvas e mudam/desativam as de lá pelo nome
  BVAs: ['id', 'nome', 'municipio', 'endereco', 'placa', 'ficha', 'ativo', 'criadoEm', 'criadoPor', 'atualizadoEm', 'atualizadoPor'],
  // Quem leu dados pessoais (LGPD): uma linha por usuário + action a cada 1 h (acessos.gs lido_). resumo = filtros, sem dado pessoal.
  AcessosADados: ['id', 'em', 'usuarioId', 'nome', 'acao', 'resumo']
};
const CAMPOS_NUMERICOS = ['pessoas', 'encerrado', 'cuidado', 'semPlaca', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts',
                          'expiraEm', 'ativo', 'ativadoEm', 'oculto', 'ocultoEm',
                          'ano', 'numero', 'ultimo', 'de', 'ate', 'em', 'numeroSugerido', 'emitidoEm', 'amostras', 'inspecao', 'coleta', 'fiel', 'auto',
                          'advertencia', 'reincidente', 'tfsAnteriores', 'cancelado', 'conflito', 'tamanho',
                          'inicioTs', 'atualizadoTs', 'registroAntigo', 'encerradoEm', 'canceladoEm',
                          'standalone', 'online', 'ultimoSinal', 'ultimoErroEm', 'primeiroSinal', 'recusaAssinatura',
                          'totalPlantas', 'plantasInspecionadas', 'importadoEm',
                          'ultimoAcesso', 'codigoExpira', 'ultimoUso', 'revogado', 'substitui',
                          'semEducacao', 'medidaFito', 'carga', 'partida', 'inspecaoFito', 'docConferido', 'pessoasEducacao', 'soPessoas',
                          'senhaProvisoria', 'senhaAlteradaEm', 'criadaEm', 'encerradaEm', 'concedidaEm', 'revogadaEm',
                          'entrouEm', 'saiuEm'];   // lat/lon/precisao ficam como texto (como em Turnos)
const LIMITES_TEXTO = { constatacao: 3000, enquadramento: 3000, documentos: 2000, produtos: 3000, motivoCancel: 300,
                        culturas: 45000, pragas: 45000, descricao: 3000, fotos: 20000, assinaturas: 1000, obs: 2000,
                        dados: 20000, testemunhas: 1000, hospedeiros: 1000, laboratorio: 2000, citros: 20000, cargaPapel: 3000 };   // demais colunas: 500
// culturas/fotos/assinaturas são JSON: cortar o texto invalidaria o JSON (e apagaria as referências no aparelho). Os limites acima
// cabem numa célula (50.000 caracteres) e o app limita a quantidade de culturas/fotos e o tamanho dos campos para nunca chegar neles.
const MAX_LINHAS_POR_ENVIO = 2000;

/** Muda a cada atualização do Code.gs: o link /exec aberto no navegador mostra esta data (confere se a nova versão foi implantada). */
const VERSAO_CODIGO = '2026-10-29c';

function doGet() {
  return json_({ ok: true, servico: 'e-GDV', versao: VERSAO_CODIGO });   // abrir o link /exec no navegador mostra qual Code.gs está publicado
}

function doPost(e) {
  USUARIO_ATUAL_ = null;   // quem está chamando: preenchido por autenticar_/adminDoToken_/admSessao_/gerenciaDe_; vale só para esta requisição
  try {
    let req = null;
    try { req = JSON.parse(e.postData.contents); } catch (x) { req = null; }
    if (!req || typeof req !== 'object' || Array.isArray(req)) throw new Error('Requisição inválida.');   // sem detalhe do JavaScript na resposta
    if (req.action === 'painelSair') return json_(sair_(req));                                 // = sair (nome usado pela tela atual do painel)
    if (req.action === 'painelDados') return json_(lido_(req, painelDados(req.key, { de: req.de, ate: req.ate, aoVivo: req.aoVivo, ids: req.ids })));
    if (req.action === 'painelEncerrarTurno') return json_(painelEncerrarTurno(req.key, req.turnoId, req.fim));
    if (req.action === 'tfVerificar') return json_(tfVerificar_(req));                      // página pública verificar.html: sem credencial
    if (req.action === 'publicoDados') return json_(publicoDados_(req));                    // dashboard público (web/dashboard/): sem credencial, só agregados
    if (req.action === 'painelPublicoConfig') return json_(painelPublicoConfig(req.key));
    if (req.action === 'painelPublicoSalvar') return json_(painelPublicoSalvar(req.key, req.config));
    if (req.action === 'painelConvenios') return json_(painelConvenios(req.key));
    if (req.action === 'painelConvApuracao') return json_(painelConvApuracao(req.key, req));
    if (req.action === 'painelConvSalvar') return json_(painelConvSalvar(req.key, req.convenio, req.config));
    if (req.action === 'painelConvLancar') return json_(painelConvLancar(req.key, req.lancamento));
    if (req.action === 'painelConvExcluir') return json_(painelConvExcluir(req.key, 'ConvLancamentos', req.id));
    if (req.action === 'painelConvFinLancar') return json_(painelConvFinLancar(req.key, req.lancamento));
    if (req.action === 'painelConvFinImportar') return json_(painelConvFinImportar(req.key, req));
    if (req.action === 'painelConvFinExcluir') return json_(painelConvExcluir(req.key, 'ConvFinanceiro', req.id));
    if (req.action === 'painelConvRelSalvar') return json_(painelConvRelSalvar(req.key, req));
    if (req.action === 'painelPceLaudo') return json_(painelPceLaudo(req.key, req));
    if (req.action === 'painelRelGdv') return json_(painelRelGdv(req.key, req));
    if (req.action === 'painelRelGdvSalvar') return json_(painelRelGdvSalvar(req.key, req));
    if (req.action === 'painelRelGdvApuracao') return json_(painelRelGdvApuracao(req.key, req));
    if (req.action === 'painelVigDados') return json_(painelVigDados(req.key, req));
    if (req.action === 'painelVigConfigSalvar') return json_(painelVigConfigSalvar(req.key, req));
    if (req.action === 'painelBvaSalvar') return json_(painelBvaSalvar(req.key, req));
    if (req.action === 'painelEscalas') return json_(painelEscalas(req.key, req));
    if (req.action === 'painelEscalaSalvar') return json_(painelEscalaSalvar(req.key, req));
    if (req.action === 'painelEscalaExcluir') return json_(painelEscalaExcluir(req.key, req));
    if (/^adm[A-Z]/.test(String(req.action || ''))) return json_(lido_(req, admAcao_(req)));   // Portal do Administrativo (token em `sessao`)
    // Login com matrícula e senha (usuarios.gs): entrar, trocarSenha, sair, minhaSessao e as actions de gerência
    const acaoUsuarios = usuariosAcao_(req.action);
    if (acaoUsuarios) return json_(lido_(req, acaoUsuarios(req)));
    const usuario = autenticar_(req.key);
    // TF/PCE: o servidor confere a autorização do módulo (foto/assinatura de TF = módulo TF; as demais, PCE)
    const dono = req.action === 'arquivoEnviar' && req.arquivo ? req.arquivo.dono : '';
    const modulo = dono === 'tfs' ? 'tf' : dono === 'turnos' ? 'veiculos'
      : Object.prototype.hasOwnProperty.call(MODULO_DA_ACAO, req.action) ? MODULO_DA_ACAO[req.action] : '';   // "toString"/"__proto__" não são módulos
    // índice de reincidência e do alerta de cuidado: também para quem só registra veículos (só hashes e contagens)
    if (modulo && !(req.action === 'tfIndiceReincidencia' && permissoesDe_(usuario).veiculos)) exigirModulo_(usuario, modulo);
    if (req.action === 'ping') return json_(ping_(req, usuario));
    if (req.action === 'sync') return json_(sincronizar_(req, usuario));
    if (req.action === 'tfConsultar') return json_(consultar_(req, usuario));
    if (req.action === 'tfProximoNumero') return json_(proximoNumero_(req));
    if (req.action === 'tfEmitir') return json_(emitir_(req, usuario));
    if (req.action === 'pceProximoNumero') return json_(pceProximoNumero_(req));
    if (req.action === 'pceEmitir') return json_(pceEmitir_(req, usuario));
    if (req.action === 'pceConsultar') return json_(lido_(req, pceConsultar_(req, usuario)));
    if (req.action === 'pceDocNumero') return json_(pceDocNumero_(req));
    if (req.action === 'pceDocRegistrar') return json_(pceDocRegistrar_(req, usuario));
    if (req.action === 'pceBaixarMunicipio') return json_(lido_(req, pceBaixarMunicipio_(req, usuario)));
    if (req.action === 'pceMapaGeral') return json_(lido_(req, pceMapaGeral_(req, usuario)));
    if (req.action === 'arquivoEnviar') return json_(arquivoEnviar_(req, usuario));
    if (req.action === 'tfAndamento') return json_(tfAndamento_(req, usuario));
    if (req.action === 'tfIndiceReincidencia') return json_(tfIndiceReincidencia_(req));
    if (req.action === 'turnoConvidar') return json_(turnoConvidar_(req, usuario));
    if (req.action === 'turnoParear') return json_(turnoParear_(req, usuario));
    if (req.action === 'turnoSair') return json_(turnoSair_(req, usuario));
    if (req.action === 'turnoPapelRegistrar') return json_(turnoPapelRegistrar_(req, usuario));
    if (req.action === 'turnoNumero') return json_(turnoNumero_(req, usuario));
    if (/^escala(Dados|Salvar|Excluir)$/.test(String(req.action))) return json_(escalaAcao_(req, usuario));
    throw new Error('Ação inválida.');
  } catch (err) {
    const r = { ok: false, erro: String(err.message || err) };
    if (err && err.semPermissao) { r.semPermissao = err.semPermissao; r.permissoes = err.permissoes; }   // o app atualiza as permissões guardadas
    if (err && err.trocarSenha) r.trocarSenha = 1;                                                       // senha provisória pendente: a tela leva à troca
    if (err && err.entrar) r.entrar = 1;                                                                 // sem sessão válida: a tela volta ao login
    return json_(r);
  }
}

/** Registros do lote menos os recusados (ids). */
function gravados_(regs, recusados) {
  if (!recusados || !recusados.length) return regs;
  return regs.filter(function (r) { return !(r && recusados.indexOf(String(r.id).slice(0, 64)) >= 0); });
}

function sincronizar_(req, usuario) {
  const turnos = lista_(req.turnos);
  const veiculos = lista_(req.veiculos);
  const tfs = lista_(req.tfs);
  const pessoas = lista_(req.pessoas);
  const placas = lista_(req.placas);
  const levantamentos = lista_(req.levantamentos);
  const colheitas = lista_(req.colheitas);
  const propriedades = lista_(req.propriedades);
  const cadastrosPce = lista_(req.cadastrosPce);
  const termosPce = lista_(req.termosPce);
  const since = Number(req.since) || 0;
  // Módulos sem autorização: os registros NÃO são gravados e voltam em "recusados" (o app os mantém pendentes no aparelho).
  // Pessoas (cadastro do fiscalizado/produtor) servem ao TF e ao PCE: entram se qualquer um dos dois estiver liberado.
  const perm = permissoesDe_(usuario), recusados = {};
  const filtrar = function (campo, regs, permitido) {
    if (permitido || !regs.length) return regs;
    recusados[campo] = regs.map(function (r) { return r && r.id ? String(r.id).slice(0, 64) : ''; }).filter(Boolean);
    return [];
  };
  const T = {
    turnos: filtrar('turnos', turnos, perm.veiculos), veiculos: filtrar('veiculos', veiculos, perm.veiculos),
    tfs: filtrar('tfs', tfs, perm.tf), placas: filtrar('placas', placas, perm.tf), pessoas: filtrar('pessoas', pessoas, perm.tf || perm.pce),
    levantamentos: filtrar('levantamentos', levantamentos, perm.pce), colheitas: filtrar('colheitas', colheitas, perm.pce),
    propriedades: filtrar('propriedades', propriedades, perm.pce),
    cadastrosPce: filtrar('cadastrosPce', cadastrosPce, perm.pce), termosPce: filtrar('termosPce', termosPce, perm.pce)
  };
  // registros antigos (digitados do papel) só com a permissão "antigo": os demais do mesmo lote entram normalmente
  if (!perm.antigo) {
    ['levantamentos', 'colheitas', 'cadastrosPce', 'termosPce', 'tfs'].forEach(function (campo) {
      const fora = T[campo].filter(function (r) { return r && Number(r.registroAntigo) === 1; });
      if (!fora.length) return;
      T[campo] = T[campo].filter(function (r) { return !(r && Number(r.registroAntigo) === 1); });
      recusados[campo] = (recusados[campo] || []).concat(fora.map(function (r) { return r.id ? String(r.id).slice(0, 64) : ''; }).filter(Boolean));
    });
  }

  // levantamento: dados de citros normalizados antes do lock (opções conhecidas, textos curtos, números ≥ 0, até 20 linhas de cultura)
  T.levantamentos.forEach(function (r) { if (r && typeof r === 'object' && ('citros' in r)) r.citros = citrosTexto_(r.citros); });
  T.levantamentos.forEach(identLev_);   // identificação: CNPJ só dígitos (14), UF com 2 letras, empresa/endereço curtos
  // UF de origem/destino (TF e veículo): sigla conhecida (UFS_) ou vazio; campo não enviado (app antigo) continua não enviado
  T.tfs.concat(T.veiculos).forEach(ufsNorm_);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const agora = Date.now();
    // registro de outro login (mesmo id) não é gravado: volta em recusados (planilha.gs gravar_)
    const alheios = function (campo, ids) { if (ids && ids.length) recusados[campo] = (recusados[campo] || []).concat(ids.map(function (x) { return String(x).slice(0, 64); })); };
    // turno cancelado no app só se não tem TF válido (o de um colega, por exemplo): com TF, fica só encerrado
    if (T.turnos.some(function (t) { return t && Number(t.cancelado) === 1; })) {
      const comTF = {}; lerLeitura_('TFs').concat(T.tfs).forEach(function (f) { if (f && f.turnoId && Number(f.cancelado) !== 1) comTF[f.turnoId] = true; });
      T.turnos.forEach(function (t) { if (t && Number(t.cancelado) === 1 && comTF[t.id]) { t.cancelado = 0; t.canceladoEm = 0; } });
    }
    letrasDosTurnos_(T.turnos);                                                        // A, B, C… pela ordem do nº do turno (turnos-compartilhados.gs)
    gravar_('Turnos', T.turnos, agora, usuario);
    alheios('veiculos', gravar_('Veiculos', T.veiculos, agora, usuario));
    T.tfs.forEach(function (t) { if (t && !t.emitidoEm) t.emitidoEm = agora; });            // momento em que a planilha recebeu o TF
    alheios('tfs', gravar_('TFs', T.tfs, agora, usuario));
    if (T.tfs.length) marcarConflitosTFs_(gravados_(T.tfs, recusados.tfs), agora);
    gravar_('Pessoas', T.pessoas, agora, usuario);
    gravar_('Placas', T.placas, agora, usuario);
    alheios('levantamentos', gravar_('Levantamentos', T.levantamentos, agora, usuario));
    const jaGravadas = {};                                                            // termos que a planilha já tem: mantêm o emitidoEm gravado
    if (T.colheitas.length) lerLeitura_('Colheitas').forEach(function (l) { jaGravadas[l.id] = true; });
    T.colheitas.forEach(function (c) {
      if (!c) return;
      if ('laboratorio' in c) c.laboratorio = labTexto_(c.laboratorio);              // só os campos do resultado (o mais novo vale: gravar_)
      c.unidade = unidadePce_(c.unidade);
      if (!c.numeroTxt && Number(c.numero) > 0 && Number(c.ano) > 0) c.numeroTxt = numeroTxtPce_(Number(c.numero), Number(c.ano), c.unidade);
      if (!c.emitidoEm) {
        if (jaGravadas[c.id]) delete c.emitidoEm;                                       // reenvio (resposta perdida, cancelamento): não troca a data de emissão
        else c.emitidoEm = agora;                                                       // momento em que a planilha recebeu o termo
      }
    });
    alheios('colheitas', gravar_('Colheitas', T.colheitas, agora, usuario));
    if (T.colheitas.length) marcarConflitos_('PCE', gravados_(T.colheitas, recusados.colheitas), agora);
    gravar_('Propriedades', T.propriedades, agora, usuario);
    // Cadastro de imóvel e Termo de Fiscalização do PCE: nº em texto no formato do papel; número repetido = conflito (o mais antigo vale)
    [['cadastro', 'cadastrosPce'], ['termo', 'termosPce']].forEach(function (x) {
      const regs = T[x[1]], D = DOCS_PCE[x[0]];
      if (!regs.length) return;
      const ja = {}; lerLeitura_(D.aba).forEach(function (l) { ja[l.id] = true; });
      regs.forEach(function (r) {
        if (!r) return;
        normalizarDocPce_(x[0], r);
        if (!r.emitidoEm) { if (ja[r.id]) delete r.emitidoEm; else r.emitidoEm = agora; }
      });
      alheios(x[1], gravar_(D.aba, regs, agora, usuario));
      marcarConflitos_(D.seq, gravados_(regs, recusados[x[1]]), agora);
    });
    // sinal do aparelho (melhor esforço: nunca derruba o envio). Desconta o que acabou de chegar.
    const encerrados = {};
    T.turnos.forEach(function (t) { if (t && t.id && Number(t.encerrado) === 1) encerrados[String(t.id)] = true; });
    try {
      registrarAparelho_(req.aparelho, usuario, agora, req.key, 'ok', { turnos: T.turnos.length, veiculos: T.veiculos.length, tfs: T.tfs.length,
        levantamentos: T.levantamentos.length, colheitas: T.colheitas.length, encerrados: encerrados });
    } catch (e) { /* aba Aparelhos com problema: o envio dos registros continua valendo */ }
    const comp = turnosCompartilhados_(usuario, agora);
    return {
      ok: true,
      agora: agora,
      // cada aparelho recebe os turnos/veículos do próprio fiscal e, do turno compartilhado (pareamento), o turno e os veículos de todos
      turnos: lerMudancasTurnos_('Turnos', since, usuario, comp.turnos, 'id'),
      veiculos: lerMudancasTurnos_('Veiculos', since, usuario, comp.veiculos, 'turnoId'),
      tfs: lerMudancas_('TFs', since, usuario),          // cada fiscal recebe só os próprios TFs
      barreiras: listarBarreiras_(),
      ultimos: ultimosPorBarreira_(),                   // último nº usado em cada barreira (ano atual): base para propor número sem internet
      levantamentos: lerMudancas_('Levantamentos', since, usuario),   // PCE: cada servidor recebe só os próprios registros
      colheitas: lerMudancas_('Colheitas', since, usuario),
      ultimosPce: ultimosPce_(),                        // último nº de Termo de Colheita por "UNIDADE|ano"
      cadastrosPce: lerMudancas_('CadastrosPCE', since, usuario),   // Cadastro de imóvel e Termo de Fiscalização do PCE (só os do próprio servidor)
      termosPce: lerMudancas_('TermosPCE', since, usuario),
      ultimosDocPce: ultimosDocPce_(),                  // último nº de Termo de Fiscalização ("T|UNIDADE|ano") e de Cadastro ("C|PROGRAMA|UNIDADE|ano")
      permissoes: perm,                                 // módulos liberados para este servidor (o app guarda e esconde o que não pode)
      bvas: bvasCadastro_(),                            // BVAs cadastradas no painel (o app junta com CONFIG.bvas)
      minhasEscalas: minhasEscalas_(),                  // escalas de plantão publicadas do fiscal que ainda não acabaram (escalas.gs)
      recusados: recusados                              // ids NÃO gravados por falta de autorização no módulo ou para registro antigo (ficam pendentes no aparelho)
    };
  } finally {
    lock.releaseLock();
  }
}
