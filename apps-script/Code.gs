/**
 * e-GDV – Controle de Veículos (Barreira Fitossanitária)
 * API de sincronização: recebe registros do app (offline-first), grava na planilha
 * e devolve o que mudou desde a última sincronização.
 *
 * Acesso dos aparelhos (por fiscal):
 *   1. No menu "e-GDV" da planilha: "Gerar código de ativação" → informe o NOME COMPLETO do fiscal
 *      (ou no painel do administrador, aba "Servidores" → Gerar chave de ativação).
 *   2. O fiscal digita o código de 6 dígitos no app (uma vez). O servidor devolve uma credencial
 *      própria daquele aparelho, vinculada ao nome. Revogue em "e-GDV → Revogar acesso" (ou na aba Servidores).
 *
 * Módulos por servidor (aba "Permissoes", editada no painel → Servidores): Educação Sanitária/Fiscalização de Trânsito, TF de Barreira e PCE.
 *   Sem linha = tudo liberado. O sync não grava registros de módulo não liberado (devolve em "recusados"; o app os mantém
 *   pendentes) e as actions do TF/PCE respondem "Sem autorização para o módulo …".
 *   Coluna "antigo" (Digitar do papel): ao contrário dos módulos, vem DESLIGADA por padrão (vazio ou sem linha = 0). Só com
 *   antigo=1 (e PCE liberado) o servidor aceita levantamentos/termos com registroAntigo=1 e PDFs escaneados (arquivo "documento").
 *
 * Opcional (compatibilidade): Propriedades do script → ACCESS_KEY = chave mestra (administrador).
 */

const TABELAS = {
  Turnos: ['id', 'numeroTF', 'data', 'letra', 'inicio', 'fim', 'fiscal', 'local', 'unidade', 'posto',
           'encerrado', 'criadoEm', 'atualizadoEm', 'srv_ts',
           'latIni', 'lngIni', 'precIni', 'latFim', 'lngFim', 'precFim', 'usuario', 'semPlaca',   // colunas novas ficam sempre no fim (semPlaca=1: placa opcional no turno)
           'encerradoPor', 'encerradoEm'],   // turno encerrado fora do aparelho: nome do administrador (painel) ou "Automático (12 h)", e quando (ms)
  Veiculos: ['id', 'turnoId', 'hora', 'placa', 'tipo', 'pessoas', 'obs',
             'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
             // ufOrigem/ufDestino: "Origem e destino (opcional)" do formulário do veículo (sigla de CONFIG.ufs ou "Exterior"; vazio = não
             // informado) — entram no VIGIFITO (internalização / cargas para outros estados) quando o veículo não tem TF ligado.
             // HISTÓRICO (o formulário não grava mais; não entram mais em nenhum cálculo; colunas mantidas pelos dados antigos):
             // semEducacao, medidaFito, carga, produtos (JSON ["PRODUTO - 10 Kg", …]), partida, inspecaoFito, docConferido
             'semEducacao', 'medidaFito', 'carga', 'produtos', 'ufOrigem', 'ufDestino', 'partida', 'inspecaoFito', 'docConferido'],
  Fiscais: ['nome', 'codigo', 'expiraEm', 'ativo', 'token', 'ativadoEm', 'perfil',   // perfil: vazio = fiscal, 'admin' = administrador
            'geradoPor',                                                             // quem gerou o código: nome do administrador (painel) ou "planilha" (menu)
            'oculto', 'ocultoPor', 'ocultoEm'],                                      // "Remover da lista" no painel: oculto=1 some da aba Servidores (a linha fica, para auditoria)
  // Termos de Fiscalização de Barreira (TF)
  TFs: ['id', 'barreira', 'ano', 'numero', 'numeroTxt', 'turnoId', 'veiculoId', 'data', 'hora', 'fiscal', 'local', 'placa', 'origem', 'destino',
        'doc', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'relacao', 'inspecao', 'coleta', 'amostras',
        'procedimento', 'fiel', 'auto', 'advertencia', 'documentos', 'produtos', 'constatacao', 'enquadramento',
        'reincidente', 'tfsAnteriores', 'cancelado', 'motivoCancel', 'conflito', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
        'numeroSugerido', 'numeroOrigem', 'emitidoEm',   // auditoria da numeração (colunas novas ficam sempre no fim)
        'fotos', 'assinaturas', 'recusaAssinatura',    // fotos = JSON [ids]; assinaturas = JSON {fiscalizado, servidor} (ids na aba Arquivos); recusaAssinatura = 1: fiscalizado se recusou
        'ufOrigem', 'ufDestino'],                     // UF de origem/destino da carga (sigla de UFS_ ou "Exterior"; vazio = não informada; TF antigo: ufDoTexto_ de origem/destino)
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
  // Módulos que cada servidor pode usar para INSERIR dados (por nome; vale para todos os aparelhos dele). 1 = liberado, 0 = sem autorização.
  // Servidor sem linha aqui = os três módulos liberados (padrão). Editada pelo painel (aba Servidores) ou à mão na planilha.
  // antigo = "Digitar do papel" (registros antigos digitados do papel + PDF escaneado): 1 = autorizado; vazio/sem linha = NÃO autorizado.
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
                   'tipoDiaria', 'servidorId', 'servidorNome', 'admId'],
  // Textos do relatório mensal (id = convenio|AAAA-MM): textos = JSON {etapas:{"1.4":{evidencias, justificativa, fator, providencia, situacao}},
  // gerais:{fatores, providencias, analise, conclusao}}
  ConvRelatorios: ['id', 'convenio', 'mes', 'numero', 'textos', 'usuario', 'atualizadoEm'],
  // Relatório GDV (painel → aba Relatórios; só administrador). Textos editáveis por relatório: id = "mensal|AAAA|MM" ou "anual|AAAA|"
  // (textos = JSON {introducao, ..., assinaturas, local}). Lançamentos manuais: UMA linha por mês e linha do quadro (id = "AAAA|MM|chave"):
  // valor numérico (quadros PCE/VIGIFITO, colunas manuais por município) ou lista = JSON (tabelas de CFO/CFOC, PTV e educação sanitária do mês).
  // O anual soma os meses. Quem/quando em cada linha (auditável na planilha).
  RelGdvTextos: ['id', 'tipo', 'ano', 'mes', 'textos', 'usuario', 'atualizadoEm'],
  RelGdvLancamentos: ['id', 'ano', 'mes', 'chave', 'valor', 'lista', 'usuario', 'atualizadoEm', 'admId'],
  // Portal do Administrativo (web/administrativo/): pessoas liberadas (login com Google pelo e-mail ou código de 6 dígitos gerado no
  // painel). Os e-mails ficam SÓ nesta aba (LGPD); os lançamentos guardam o nome e o admId. Gerida no painel → Servidores.
  Administrativo: ['id', 'email', 'nome', 'ativo', 'criadoEm', 'criadoPor', 'ultimoAcesso', 'codigo', 'codigoExpira', 'atualizadoEm', 'atualizadoPor'],
  // Sessões do portal: só o SHA-256 do token (o token em si fica no navegador); 12 h, renovada a cada uso; revogado = 1 ao sair.
  AdmSessoes: ['id', 'hash', 'admId', 'origem', 'criadoEm', 'expiraEm', 'ultimoUso', 'revogado'],
  // Histórico de alterações feitas no portal (antes/depois em JSON).
  AdmHistorico: ['em', 'admId', 'nome', 'acao', 'aba', 'registro', 'antes', 'depois'],
  // VIGIFITO: configuração (postos e a escala dos períodos de 10 dias; sem linha = semente vigSemente_) e valores lançados por
  // posto × mês (periodo = AAAA-MM) ou por período de 10 dias (periodo = P<AAAA-MM-DD do início>). Uma linha por célula
  // (id = periodo|posto|indicador); substitui = 1: valor que substitui o apurado pelo e-GDV (com justificativa).
  VigConfig: ['id', 'config', 'atualizadoEm', 'atualizadoPor'],
  VigLancamentos: ['id', 'ano', 'periodo', 'posto', 'indicador', 'valor', 'substitui', 'justificativa', 'origem', 'arquivo', 'usuario', 'admId', 'atualizadoEm', 'excluido']
};
const CAMPOS_NUMERICOS = ['pessoas', 'encerrado', 'semPlaca', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts',
                          'expiraEm', 'ativo', 'ativadoEm', 'oculto', 'ocultoEm',
                          'ano', 'numero', 'ultimo', 'de', 'ate', 'em', 'numeroSugerido', 'emitidoEm', 'amostras', 'inspecao', 'coleta', 'fiel', 'auto',
                          'advertencia', 'reincidente', 'tfsAnteriores', 'cancelado', 'conflito', 'tamanho',
                          'inicioTs', 'atualizadoTs', 'registroAntigo', 'encerradoEm',
                          'standalone', 'online', 'ultimoSinal', 'ultimoErroEm', 'primeiroSinal', 'recusaAssinatura',
                          'totalPlantas', 'plantasInspecionadas', 'importadoEm',
                          'ultimoAcesso', 'codigoExpira', 'ultimoUso', 'revogado', 'substitui',
                          'semEducacao', 'medidaFito', 'carga', 'partida', 'inspecaoFito', 'docConferido'];   // lat/lon/precisao ficam como texto (como em Turnos)
const LIMITES_TEXTO = { constatacao: 3000, enquadramento: 3000, documentos: 2000, produtos: 3000, motivoCancel: 300,
                        culturas: 45000, pragas: 45000, descricao: 3000, fotos: 20000, assinaturas: 1000, obs: 2000,
                        dados: 20000, testemunhas: 1000, hospedeiros: 1000, laboratorio: 2000, citros: 20000 };   // demais colunas: 500
// culturas/fotos/assinaturas são JSON: cortar o texto invalidaria o JSON (e apagaria as referências no aparelho). Os limites acima
// cabem numa célula (50.000 caracteres) e o app limita a quantidade de culturas/fotos e o tamanho dos campos para nunca chegar neles.
const VALIDADE_CODIGO_MS = 7 * 24 * 3600 * 1000;      // código de ativação vale 7 dias
const MAX_FALHAS_ATIVACAO = 10;                        // tentativas erradas antes de bloquear por 15 min
const MAX_FALHAS_ADMIN = 5;                            // idem para o código de administrador do painel (contador próprio)
const MAX_LINHAS_POR_ENVIO = 2000;

/** Muda a cada atualização do Code.gs: o link /exec aberto no navegador mostra esta data (confere se a nova versão foi implantada). */
const VERSAO_CODIGO = '2026-10-20a';

function doGet(e) {
  if (e && e.parameter && e.parameter.p === 'painel') return painelHtml_();
  return json_({ ok: true, servico: 'e-GDV', versao: VERSAO_CODIGO });   // abrir o link /exec no navegador mostra qual Code.gs está publicado
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'ativar') return json_(ativar_({ codigo: req.codigo }));          // app dos fiscais: só códigos de fiscal
    if (req.action === 'painelAtivar') return json_(painelAtivar(req.codigo));             // painel (GitHub Pages): só códigos de administrador
    if (req.action === 'painelDados') return json_(painelDados(req.key, { de: req.de, ate: req.ate, aoVivo: req.aoVivo, ids: req.ids }));
    if (req.action === 'painelSair') return json_(painelSair(req.key));
    if (req.action === 'painelGerarCodigo') return json_(painelGerarCodigo(req.key, req.nome, req.modulos));
    if (req.action === 'painelAcessos') return json_(painelAcessos(req.key, req.ocultos));
    if (req.action === 'painelOcultarAcesso') return json_(painelOcultarAcesso(req.key, req.nome, false));
    if (req.action === 'painelRestaurarAcesso') return json_(painelOcultarAcesso(req.key, req.nome, true));
    if (req.action === 'painelRevogar') return json_(painelRevogar(req.key, req.nome));
    if (req.action === 'painelRevogarAdmin') return json_(painelRevogarAdmin(req.key, req.nome));
    if (req.action === 'painelPermissoes') return json_(painelPermissoes(req.key, req.nome, req));
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
    if (req.action === 'painelAdmLista') return json_(painelAdmLista(req.key));
    if (req.action === 'painelAdmSalvar') return json_(painelAdmSalvar(req.key, req));
    if (req.action === 'painelAdmCodigo') return json_(painelAdmCodigo(req.key, req));
    // Portal do Administrativo: login (Google ou código) e as demais actions com a sessão do portal (nunca com a credencial do painel/app)
    if (req.action === 'admLogin') return json_(admLogin_(req));
    if (req.action === 'admCodigo') return json_(admCodigo_(req));
    if (/^adm[A-Z]/.test(String(req.action || ''))) return json_(admAcao_(req));
    const usuario = autenticar_(req.key);
    // TF/PCE: o servidor confere a autorização do módulo (foto/assinatura de TF = módulo TF; as demais, PCE)
    const modulo = req.action === 'arquivoEnviar' && req.arquivo && req.arquivo.dono === 'tfs' ? 'tf' : MODULO_DA_ACAO[req.action];
    if (modulo) exigirModulo_(usuario, modulo);
    if (req.action === 'ping') return json_(ping_(req, usuario));
    if (req.action === 'sync') return json_(sincronizar_(req, usuario));
    if (req.action === 'tfConsultar') return json_(consultar_(req, usuario));
    if (req.action === 'tfProximoNumero') return json_(proximoNumero_(req));
    if (req.action === 'tfEmitir') return json_(emitir_(req, usuario));
    if (req.action === 'pceProximoNumero') return json_(pceProximoNumero_(req));
    if (req.action === 'pceEmitir') return json_(pceEmitir_(req, usuario));
    if (req.action === 'pceConsultar') return json_(pceConsultar_(req, usuario));
    if (req.action === 'pceDocNumero') return json_(pceDocNumero_(req));
    if (req.action === 'pceDocRegistrar') return json_(pceDocRegistrar_(req, usuario));
    if (req.action === 'pceBaixarMunicipio') return json_(pceBaixarMunicipio_(req, usuario));
    if (req.action === 'arquivoEnviar') return json_(arquivoEnviar_(req, usuario));
    if (req.action === 'tfAndamento') return json_(tfAndamento_(req, usuario));
    if (req.action === 'tfIndiceReincidencia') return json_(tfIndiceReincidencia_(req));
    throw new Error('Ação inválida.');
  } catch (err) {
    const r = { ok: false, erro: String(err.message || err) };
    if (err && err.semPermissao) { r.semPermissao = err.semPermissao; r.permissoes = err.permissoes; }   // o app atualiza as permissões guardadas
    return json_(r);
  }
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
    ['levantamentos', 'colheitas', 'cadastrosPce', 'termosPce'].forEach(function (campo) {
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
    gravar_('Turnos', T.turnos, agora, usuario);
    gravar_('Veiculos', T.veiculos, agora, usuario);
    T.tfs.forEach(function (t) { if (t && !t.emitidoEm) t.emitidoEm = agora; });            // momento em que a planilha recebeu o TF
    gravar_('TFs', T.tfs, agora, usuario);
    if (T.tfs.length) marcarConflitosTFs_(T.tfs, agora);
    gravar_('Pessoas', T.pessoas, agora, usuario);
    gravar_('Placas', T.placas, agora, usuario);
    gravar_('Levantamentos', T.levantamentos, agora, usuario);
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
    gravar_('Colheitas', T.colheitas, agora, usuario);
    if (T.colheitas.length) marcarConflitos_('PCE', T.colheitas, agora);
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
      gravar_(D.aba, regs, agora, usuario);
      marcarConflitos_(D.seq, regs, agora);
    });
    // sinal do aparelho (melhor esforço: nunca derruba o envio). Desconta o que acabou de chegar.
    const encerrados = {};
    T.turnos.forEach(function (t) { if (t && t.id && Number(t.encerrado) === 1) encerrados[String(t.id)] = true; });
    try {
      registrarAparelho_(req.aparelho, usuario, agora, req.key, 'ok', { turnos: T.turnos.length, veiculos: T.veiculos.length, tfs: T.tfs.length,
        levantamentos: T.levantamentos.length, colheitas: T.colheitas.length, encerrados: encerrados });
    } catch (e) { /* aba Aparelhos com problema: o envio dos registros continua valendo */ }
    return {
      ok: true,
      agora: agora,
      turnos: lerMudancas_('Turnos', since, usuario),       // cada aparelho recebe só os turnos/veículos do próprio fiscal
      veiculos: lerMudancas_('Veiculos', since, usuario),
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
      recusados: recusados                              // ids NÃO gravados por falta de autorização no módulo ou para registro antigo (ficam pendentes no aparelho)
    };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Sinal do aparelho (heartbeat) ---------- */

const PLATAFORMAS_ = ['android', 'ios', 'outro'];
const RE_ID_APARELHO_ = /^[A-Za-z0-9-]{8,64}$/;
const PENDENTES_CHAVES_ = ['turnos', 'veiculos', 'tfs', 'levantamentos', 'colheitas', 'arquivos'];
/** Texto de uma linha, curto e que nunca vira fórmula na planilha. */
function textoCurto_(v, n) {
  return String(v === null || v === undefined ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().replace(/^[=+\-@\s]+/, '').slice(0, n);
}

/**
 * "ping" autenticado. Com {aparelho}: só grava o sinal, marcando situacao = 'erro' quando o aparelho relata um erro (o app chama
 * isto UMA vez quando o sync completo falha por erro do servidor, para o painel ver o motivo). Sem aparelho: teste de conexão.
 */
function ping_(req, usuario) {
  const agora = Date.now();
  if (req.aparelho && typeof req.aparelho === 'object') {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { registrarAparelho_(req.aparelho, usuario, agora, req.key, req.aparelho.ultimoErro ? 'erro' : 'ok', null); }
    finally { lock.releaseLock(); }
  }
  return { ok: true, nome: usuario, agora: agora };
}

/**
 * Grava/atualiza a linha do aparelho na aba Aparelhos (chamar com o lock). a = sinal enviado pelo app (null = versão antiga do app:
 * registra só "sincronizou agora" numa linha "legado-"). aceitos = quantos registros de cada tipo chegaram neste envio (descontados
 * dos pendentes informados, que o app conta antes de enviar) e os ids dos turnos encerrados aceitos.
 */
function registrarAparelho_(a, usuario, agora, key, situacao, aceitos) {
  const cred = String(key || '').slice(0, 8);
  let o;
  if (a && typeof a === 'object' && RE_ID_APARELHO_.test(String(a.id || ''))) {
    const pend = {}, ac = aceitos || {}, encAceitos = ac.encerrados || {};
    PENDENTES_CHAVES_.forEach(function (k) {
      let n = Math.max(0, Math.floor(Number(a.pendentes && a.pendentes[k]) || 0));
      if (ac[k]) n = Math.max(0, n - ac[k]);
      if (n) pend[k] = Math.min(n, 999999);
    });
    const enc = (Array.isArray(a.turnosEncerradosPendentes) ? a.turnosEncerradosPendentes : []).map(function (id) { return String(id || '').slice(0, 64); })
      .filter(function (id) { return id && !encAceitos[id]; }).slice(0, 20);
    const fim = {};
    enc.forEach(function (id) { const f = a.fimPendentes && a.fimPendentes[id]; if (f && RE_HM_.test(String(f))) fim[id] = String(f); });
    const errEm = Number(a.ultimoErroEm) || 0;
    o = { id: String(a.id), usuario: usuario, versao: textoCurto_(a.versao, 40), plataforma: PLATAFORMAS_.indexOf(a.plataforma) >= 0 ? a.plataforma : 'outro',
          standalone: a.standalone ? 1 : 0, online: a.online === false ? 0 : 1, ultimoSinal: agora, pendentes: JSON.stringify(pend),
          turnoAtual: textoCurto_(a.turnoAtual, 64), turnosEncerradosPendentes: JSON.stringify(enc), fimPendentes: JSON.stringify(fim),
          ultimoErro: textoCurto_(a.ultimoErro, 200), ultimoErroEm: a.ultimoErro ? (errEm > 1e12 && errEm < agora + 864e5 ? errEm : agora) : 0,
          origem: a.origem === 'segundo-plano' ? 'segundo-plano' : 'app', situacao: situacao === 'erro' ? 'erro' : 'ok', cred: cred };
  } else {
    if (!cred) return;
    o = { id: 'legado-' + cred, usuario: usuario, versao: '', plataforma: '', standalone: 0, online: 1, ultimoSinal: agora, pendentes: '',
          turnoAtual: '', turnosEncerradosPendentes: '[]', fimPendentes: '{}', ultimoErro: '', ultimoErroEm: 0, origem: 'app', situacao: 'ok', cred: cred };
  }
  const t = lerTudo_('Aparelhos'), cols = t.cols;
  let idx = -1;
  t.valores.forEach(function (l, i) { if (String(l[0]) === o.id) idx = i; });
  if (idx >= 0) {
    const atual = paraObjeto_(cols, t.valores[idx]);
    o.primeiroSinal = atual.primeiroSinal || agora;
    if (!o.ultimoErro) { o.ultimoErro = atual.ultimoErro; o.ultimoErroEm = atual.ultimoErroEm; }   // o último erro fica como histórico
    t.sh.getRange(idx + 2, 1, 1, cols.length).setValues([cols.map(function (c) { return o[c]; })]);
  } else {
    o.primeiroSinal = agora;
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, cols.length).setValues([cols.map(function (c) { return o[c]; })]);
  }
}

/** Aparelhos lidos da planilha (JSON já interpretado). A linha "legado-" some quando o mesmo acesso já manda o sinal novo. */
function lerAparelhos_() {
  const lst = lerLeitura_('Aparelhos').filter(function (a) { return a.id && a.usuario; }).map(function (a) {
    const pend = lerJSONSeguro_(a.pendentes, {}), p = {};
    let total = 0;
    PENDENTES_CHAVES_.forEach(function (k) { const n = Math.max(0, Number(pend && pend[k]) || 0); if (n) { p[k] = n; total += n; } });
    const enc = lerJSONSeguro_(a.turnosEncerradosPendentes, []), fim = lerJSONSeguro_(a.fimPendentes, {});
    return { id: a.id, usuario: a.usuario, versao: a.versao, plataforma: a.plataforma, standalone: a.standalone, online: a.online, ultimoSinal: a.ultimoSinal,
             pendentes: p, pendentesTotal: total, turnoAtual: a.turnoAtual, turnosEncerradosPendentes: Array.isArray(enc) ? enc.map(String) : [],
             fimPendentes: fim && typeof fim === 'object' && !Array.isArray(fim) ? fim : {}, ultimoErro: a.ultimoErro, ultimoErroEm: a.ultimoErroEm || 0,
             origem: a.origem, situacao: a.situacao || 'ok', cred: a.cred, legado: a.id.indexOf('legado-') === 0 };
  });
  const novos = {};
  lst.forEach(function (a) { if (!a.legado && a.cred) novos[a.cred] = true; });
  return lst.filter(function (a) { return !a.legado || !novos[a.cred]; });
}
/** Resumo de um aparelho para o painel (sem id nem credencial). */
function resumoAparelho_(a) {
  return { versao: a.versao, plataforma: a.plataforma, standalone: a.standalone, ultimoSinal: a.ultimoSinal, origem: a.origem, legado: a.legado,
           pendentes: a.pendentes, pendentesTotal: a.pendentesTotal, encerradosPendentes: a.turnosEncerradosPendentes.length,
           ultimoErro: a.ultimoErro, ultimoErroEm: a.ultimoErroEm, erroAtual: a.situacao === 'erro' };
}

/* ---------- Termos de Fiscalização (TF): numeração, conflitos e reincidência ---------- */

function digitos_(v) { return String(v || '').replace(/\D/g, ''); }
function placaNorm_(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function listarBarreiras_() {
  const sh = aba_('Barreiras');
  if (sh.getLastRow() < 2) sh.getRange(2, 1, 1, 5).setValues([['BVA-CEASA', 'Barreira Porto da CEASA', 'BVA - CEASA', 'BR-319 PORTO DA CEASA', 1]]);
  return lerLeitura_('Barreiras').filter(function (b) { return b.id && b.ativo === 1; })
    .map(function (b) { return { id: b.id, nome: b.nome, sufixo: b.sufixo, local: b.local }; });
}

/**
 * Sequências numeradas. TF: uma por barreira/ano (aba TFs). PCE (Termo de Colheita): uma por unidade/ano (aba Colheitas).
 * Na aba Numeracao, o id é "barreira|ano" (TF, como sempre foi) ou "PCE|UNIDADE|ano"; a coluna "barreira" guarda a barreira ou a unidade.
 */
const SEQUENCIAS = {
  TF: { aba: 'TFs', grupo: 'barreira', prefixo: '', nome: 'TF' },
  PCE: { aba: 'Colheitas', grupo: 'unidade', prefixo: 'PCE|', nome: 'Termo de Colheita' },
  // PCE: Termo de Fiscalização (uma sequência por unidade/ano) e Cadastro de imóvel (por programa + unidade + ano: grupo "MONILIASE|AUTAZES")
  TPCE: { aba: 'TermosPCE', grupo: 'unidade', prefixo: 'TPCE|', nome: 'Termo de Fiscalização (PCE)' },
  CPCE: { aba: 'CadastrosPCE', grupo: 'unidade', prefixo: 'CPCE|', nome: 'Cadastro de imóvel (PCE)',
          grupoDe: function (r) { return String(r.programa || 'moniliase').toUpperCase() + '|' + r.unidade; } }
};
function chaveSeq_(tipo, grupo, ano) { return SEQUENCIAS[tipo].prefixo + grupo + '|' + ano; }
/** Grupo da sequência de um registro (barreira, unidade ou "PROGRAMA|UNIDADE"). */
function grupoSeq_(tipo, r) { const s = SEQUENCIAS[tipo]; return s.grupoDe ? s.grupoDe(r) : r[s.grupo]; }

/**
 * Numeração: UMA sequência por grupo (barreira ou unidade) e por ano, sem faixas reservadas. O "último usado" é o maior
 * número entre os registros gravados (inclusive cancelados, que mantêm o número) e o ponto de partida da aba Numeracao.
 */
function ultimoSeq_(tipo, grupo, ano, regs) {
  const s = SEQUENCIAS[tipo];
  let ultimo = 0, ref = null;
  const base = lerLeitura_('Numeracao').filter(function (r) { return r.id === chaveSeq_(tipo, grupo, ano); })[0];
  if (base) ultimo = base.ultimo;
  (regs || lerLeitura_(s.aba)).forEach(function (r) { if (grupoSeq_(tipo, r) === grupo && r.ano === ano && r.numero > ultimo) { ultimo = r.numero; ref = r; } });
  return { ultimo: ultimo, ref: ref };
}

function ultimoNumero_(barreira, ano, tfs) { return ultimoSeq_('TF', barreira, ano, tfs); }

function ultimosPorBarreira_() {
  const tfs = lerLeitura_('TFs'), ano = new Date().getFullYear(), o = {};
  listarBarreiras_().forEach(function (b) { o[b.id + '|' + ano] = ultimoNumero_(b.id, ano, tfs).ultimo; });
  return o;
}

/** "Qual é o próximo número?" – consulta rápida feita pelo app na hora de gerar o TF (não reserva nada). */
function proximoNumero_(req) {
  const barreira = String(req.barreira || '').slice(0, 64), ano = Number(req.ano) || new Date().getFullYear();
  if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
  const u = ultimoNumero_(barreira, ano);
  return { ok: true, barreira: barreira, ano: ano, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoTF: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}

/**
 * Emissão: grava o TF só se o número ainda estiver livre (sob lock). Se outro fiscal usou o número nesse
 * intervalo, devolve emitido = false e o próximo livre, ANTES de qualquer impressão.
 */
function emitir_(req, usuario) {
  const tf = req.tf || {};
  const barreira = String(tf.barreira || ''), ano = Number(tf.ano) || 0, numero = Number(tf.numero) || 0;
  if (!tf.id || !barreira || !ano || numero < 1) throw new Error('Dados do TF incompletos.');
  if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
  ufsNorm_(tf);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_('TFs');
    const ocupante = todos.filter(function (r) { return r.barreira === barreira && r.ano === ano && r.numero === numero && r.id !== tf.id; })[0];
    if (ocupante) {
      const u = ultimoNumero_(barreira, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (r) { return r.id === tf.id; })[0];
    tf.emitidoEm = (antes && antes.emitidoEm) || agora;                          // reenvio do mesmo TF não muda a data de emissão
    gravar_('TFs', [tf], agora, usuario);
    if (req.pessoa) gravar_('Pessoas', [req.pessoa], agora, usuario);
    if (req.placa) gravar_('Placas', [req.placa], agora, usuario);
    return { ok: true, emitido: true, numero: numero, emitidoEm: tf.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}

/** Auditoria da sequência de uma barreira (TF) ou unidade (PCE) / ano: lacunas e números usados mais de uma vez. */
function auditarSequencia_(barreira, ano, tipo) {
  tipo = tipo || 'TF';
  if (tipo !== 'TF') barreira = unidadePce_(barreira);
  return auditarRegs_(tipo, barreira, ano, lerLeitura_(SEQUENCIAS[tipo].aba), lerLeitura_('Numeracao'));
}

/** Número duplicado (mesmo grupo/ano): o registro mais antigo vale; os demais ficam com conflito = 1. */
function marcarConflitos_(tipo, recebidos, agora) {
  const s = SEQUENCIAS[tipo], ids = {};
  recebidos.forEach(function (r) { if (r && r.id) ids[r.id] = true; });
  const t = lerTudo_(s.aba), iC = t.cols.indexOf('conflito') + 1, iS = t.cols.indexOf('srv_ts') + 1, grupos = {};
  t.valores.forEach(function (l, i) {
    const o = paraObjeto_(t.cols, l);
    if (tipo !== 'TF' && !(o.numero > 0)) return;                       // termo sem número não entra em conflito (TF: comportamento original)
    if ((tipo === 'TPCE' || tipo === 'CPCE') && o.excluido === 1) return;   // cadastro excluído não disputa o número
    const k = grupoSeq_(tipo, o) + '|' + o.ano + '|' + o.numero;
    (grupos[k] = grupos[k] || []).push({ i: i, o: o });
  });
  Object.keys(grupos).forEach(function (k) {
    const g = grupos[k];
    if (!g.some(function (x) { return ids[x.o.id]; })) return;
    g.sort(function (a, b) { return a.o.criadoEm - b.o.criadoEm || String(a.o.id).localeCompare(String(b.o.id)); });
    g.forEach(function (x, n) {
      const quer = g.length > 1 && n > 0 ? 1 : 0;
      if (x.o.conflito !== quer) { t.sh.getRange(x.i + 2, iC).setValue(quer); t.sh.getRange(x.i + 2, iS).setValue(agora); }
    });
  });
}

function marcarConflitosTFs_(recebidos, agora) { marcarConflitos_('TF', recebidos, agora); }

/** Define o ponto de partida (último nº já usado) de uma barreira (TF) ou unidade (PCE) / ano, ex.: ao começar no meio do ano. */
function definirSequencia_(barreira, ano, ultimo, tipo) {
  tipo = tipo || 'TF';
  if (tipo !== 'TF' && (!(Number(ano) > 2000) || !(Number(ultimo) >= 0))) throw new Error('Ano ou número inválido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (tipo !== 'TF') {
      barreira = unidadePce_(barreira);
      if (!barreira) throw new Error('Informe a unidade.');
    } else if (!listarBarreiras_().some(function (b) { return b.id === barreira; })) throw new Error('Barreira desconhecida: ' + barreira);
    const t = lerTudo_('Numeracao'), id = chaveSeq_(tipo, barreira, ano);
    let idx = -1;
    t.valores.forEach(function (l, i) { if (String(l[0]) === id) idx = i; });
    const linha = [[id, barreira, Number(ano), Number(ultimo), Date.now()]];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, 5).setValues(linha); else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, 5).setValues(linha);
    return Number(ultimo);
  } finally { lock.releaseLock(); }
}

function resumoTFs_(rows) {
  const r = { total: rows.length, liberacoes: 0, apreensoes: 0, rechacos: 0, autos: 0, advertencias: 0, ultimos: [] };
  rows.forEach(function (x) {
    if (x.procedimento === 'liberacao') r.liberacoes++; else if (x.procedimento === 'apreensao') r.apreensoes++; else if (x.procedimento === 'rechaco') r.rechacos++;
    if (x.auto === 1) r.autos++; if (x.advertencia === 1) r.advertencias++;
  });
  r.ultimos = rows.slice().sort(function (a, b) { return String(b.data + b.hora).localeCompare(String(a.data + a.hora)); }).slice(0, 5)
    .map(function (x) { return { numeroTxt: x.numeroTxt, data: x.data, procedimento: x.procedimento, placa: x.placa, produtos: x.produtos }; });
  r.reincidente = r.apreensoes + r.rechacos + r.autos >= 1;      // houve medida anterior (apreensão, rechaço ou auto de infração)
  return r;
}

/** Cadastro + histórico (reincidência) por CPF/CNPJ e por placa. */
function consultar_(req, usuario) {
  const doc = digitos_(req.doc), placa = placaNorm_(req.placa);
  if (doc.length !== 11 && doc.length !== 14 && placa.length < 7) throw new Error('Informe um CPF/CNPJ completo ou uma placa.');
  const pessoa = doc ? lerLeitura_('Pessoas').filter(function (p) { return p.id === doc; })[0] : null;
  const pl = placa ? lerLeitura_('Placas').filter(function (p) { return p.id === placa; })[0] : null;
  const tfs = lerLeitura_('TFs').filter(function (t) { return t.cancelado !== 1; });
  const porDoc = doc ? resumoTFs_(tfs.filter(function (t) { return digitos_(t.doc) === doc; })) : null;
  const porPlaca = placa ? resumoTFs_(tfs.filter(function (t) { return placaNorm_(t.placa) === placa; })) : null;
  const mask = doc ? doc.slice(0, 3) + '***' + doc.slice(-2) : '';
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, mask, placa, (pessoa || (porDoc && porDoc.total)) ? 'encontrado' : 'novo']]);
  return {
    ok: true,
    pessoa: pessoa ? { id: pessoa.id, tipo: pessoa.tipo, nome: pessoa.nome, rg: pessoa.rg, endereco: pessoa.endereco, municipio: pessoa.municipio, uf: pessoa.uf, telefone: pessoa.telefone } : null,
    placa: pl ? { id: pl.id, doc: pl.doc, nome: pl.nome } : null,
    historicoDoc: porDoc, historicoPlaca: porPlaca
  };
}

/* ---------- Verificação pública de autenticidade (verificar.html, sem credencial) ---------- */

const VERIF_MAX_INVALIDAS = 30;                 // consultas a ids inexistentes/inválidos por minuto (todas as origens): freia varredura
const RE_ID_TF_ = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;   // o id do TF é UUID v4 gerado no aparelho (não adivinhável)

/** Placa parcialmente mascarada: "ABC1D23" → "ABC***3". */
function placaMascarada_(v) {
  const p = placaNorm_(v);
  return p.length >= 5 ? p.slice(0, 3) + '***' + p.slice(-1) : (p ? '***' : '');
}

/**
 * tfVerificar {id}: o QR code impresso no TF leva a verificar.html?t=<id>. Devolve só o necessário para conferir o documento —
 * nº, data/hora, barreira, procedimento, servidor, situação (válido/cancelado e motivo) e placa mascarada. Nunca CPF/CNPJ, nome do
 * fiscalizado, endereço, telefone ou produtos. Ids inválidos ou não encontrados contam num limite global por minuto (CacheService).
 */
function tfVerificar_(req) {
  const cache = CacheService.getScriptCache(), chave = 'verif_inval_' + Math.floor(Date.now() / 60000);
  const invalidas = Number(cache.get(chave) || 0);
  if (invalidas >= VERIF_MAX_INVALIDAS) throw new Error('Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.');
  const id = String(req.id || '').trim().toLowerCase();
  const t = RE_ID_TF_.test(id) ? lerLeitura_('TFs').filter(function (r) { return String(r.id).toLowerCase() === id; })[0] : null;
  if (!t) { cache.put(chave, String(invalidas + 1), 120); return { ok: true, encontrado: false }; }
  const bar = lerLeitura_('Barreiras').filter(function (b) { return b.id === t.barreira; })[0];
  const PROC = { liberacao: 'Liberação', apreensao: 'Apreensão p/ destruição', rechaco: 'Rechaço (retorno à origem)' };
  return { ok: true, encontrado: true, tf: {
    numeroTxt: t.numeroTxt, data: t.data, hora: t.hora, barreira: bar ? bar.nome : t.barreira,
    procedimento: PROC[t.procedimento] || 'Não informado', servidor: t.fiscal || t.usuario,
    situacao: t.cancelado === 1 ? 'cancelado' : 'valido', motivoCancel: t.cancelado === 1 ? t.motivoCancel : '',
    placa: placaMascarada_(t.placa), emitidoEm: t.emitidoEm || null } };
}

/* ---------- Índice de reincidência (consulta sem internet no app) ---------- */

const INDICE_CACHE_S = 600;                     // índice completo guardado por 10 min (CacheService)
/** SHA-256 em hex (16 primeiros caracteres) de "doc:<dígitos>" ou "placa:<placa>". */
function hashIndice_(txt) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8);
  return b.slice(0, 8).map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
/** Agrega os TFs (t._h = hashes das chaves) por chave: {h, n, ap, re, au, li, ad, ult}; cancelados não contam (mas a chave aparece, com n = 0). */
function agregarIndice_(tfs) {
  const m = {};
  const somar = function (h, t) {
    const a = m[h] = m[h] || { h: h, n: 0, ap: 0, re: 0, au: 0, li: 0, ad: 0, ult: '' };
    if (t.cancelado === 1) return;
    a.n++;
    if (t.procedimento === 'apreensao') a.ap++; else if (t.procedimento === 'rechaco') a.re++; else if (t.procedimento === 'liberacao') a.li++;
    if (t.auto === 1) a.au++; if (t.advertencia === 1) a.ad++;
    if (String(t.data) > a.ult) a.ult = String(t.data);
  };
  tfs.forEach(function (t) { t._h.forEach(function (h) { somar(h, t); }); });
  return Object.keys(m).map(function (k) { return m[k]; });
}
/** Hashes das chaves do TF (documento e placa); com filtro {docs, placas}, só as chaves que estão nele. */
function chavesTF_(t, filtro) {
  const h = [], d = digitos_(t.doc), p = placaNorm_(t.placa);
  if ((d.length === 11 || d.length === 14) && (!filtro || filtro.docs[d])) h.push(hashIndice_('doc:' + d));
  if (p.length >= 7 && (!filtro || filtro.placas[p])) h.push(hashIndice_('placa:' + p));
  return h;
}
/**
 * tfIndiceReincidencia {key, desde}: histórico de TODOS os TFs (todas as barreiras) resumido por hash do CPF/CNPJ e da placa, sem dados
 * pessoais em claro. Com desde (ms do índice anterior): só as chaves com TF gravado/alterado depois, recalculadas por inteiro (n = 0 =
 * apagar). Sem desde: índice completo (guardado 10 min no CacheService e completado com o que mudou desde então).
 * Devolve {ok, agora, completo, itens: [{h, n, ap, re, au, li, ad, ult}]}.
 */
function tfIndiceReincidencia_(req) {
  const desde = Number(req.desde) || 0, cache = CacheService.getScriptCache(), agora = Date.now();
  const tfs = lerLeitura_('TFs').filter(function (t) { return t.id; });
  let base = null;
  if (!desde) { try { base = JSON.parse(cache.get('indice_reinc') || 'null'); } catch (e) { base = null; } }
  if (!desde && !base) {
    tfs.forEach(function (t) { t._h = chavesTF_(t, null); });
    const r = { agora: agora, completo: true, itens: agregarIndice_(tfs).filter(function (a) { return a.n > 0; }) };
    const txt = JSON.stringify(r);
    if (txt.length < 90000) { try { cache.put('indice_reinc', txt, INDICE_CACHE_S); } catch (e) { /* grande demais para o cache */ } }
    r.ok = true;
    return r;
  }
  // só as chaves (documento/placa, comparados em claro aqui no servidor) com TF gravado ou alterado depois de "ref" (1 s de folga)
  const ref = desde || base.agora, filtro = { docs: {}, placas: {} };
  tfs.forEach(function (t) {
    if (t.srv_ts < ref - 1000) return;
    filtro.docs[digitos_(t.doc)] = true; filtro.placas[placaNorm_(t.placa)] = true;
  });
  const sel = tfs.filter(function (t) { return filtro.docs[digitos_(t.doc)] || filtro.placas[placaNorm_(t.placa)]; });
  sel.forEach(function (t) { t._h = chavesTF_(t, filtro); });
  const itens = agregarIndice_(sel);
  if (!base) return { ok: true, agora: agora, completo: false, itens: itens };
  const m = {};
  base.itens.forEach(function (a) { m[a.h] = a; });
  itens.forEach(function (a) { m[a.h] = a; });
  return { ok: true, agora: agora, completo: true, itens: Object.keys(m).map(function (k) { return m[k]; }).filter(function (a) { return a.n > 0; }) };
}

/* ---------- TF em preenchimento (sinal ao vivo para o painel) ---------- */

const ANDAMENTO_VALIDADE_MS = 10 * 60 * 1000;   // sem batimento (o app manda a cada 2 min) há mais de 10 min = encerrado
const PROCEDIMENTOS_TF = ['liberacao', 'apreensao', 'rechaco'];

/**
 * O app avisa que um TF está sendo preenchido (estado "preenchendo": ao abrir o formulário, ao mudar procedimento/placa e a cada 2 min)
 * ou que deixou de estar ("fim": gerado, descartado ou o fiscal saiu do formulário). Upsert por usuario|rascunhoId (melhor esforço:
 * sem internet o app não envia nada). Grava só o necessário para o alerta: placa, procedimento, local/barreira e coordenada.
 */
function tfAndamento_(req, usuario) {
  const estado = String(req.estado || ''), rid = String(req.rascunhoId || '');
  if (estado !== 'preenchendo' && estado !== 'fim') throw new Error('Estado inválido.');
  if (!/^[\w-]{1,64}$/.test(rid)) throw new Error('Rascunho inválido.');
  const id = (usuario + '|' + rid).slice(0, 160), txt = function (v, n) { return String(v === null || v === undefined ? '' : v).trim().slice(0, n || 120); };
  const coord = function (v, lim) { const n = numOuNulo_(v); return n !== null && Math.abs(n) <= lim ? String(n) : ''; };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Andamento'), agora = Date.now();
    let idx = -1;
    t.valores.forEach(function (l, i) { if (String(l[0]) === id) idx = i; });
    const antes = idx >= 0 ? paraObjeto_(t.cols, t.valores[idx]) : null;
    if (estado === 'fim' && !antes) return { ok: true };                         // nada em andamento para encerrar
    let o;
    if (estado === 'fim') o = Object.assign({}, antes, { estado: 'fim', atualizadoTs: agora });
    else {
      const lat = coord(req.lat, 90), lon = coord(req.lon, 180), temGps = lat !== '' && lon !== '';
      const continua = antes && antes.estado === 'preenchendo' && agora - antes.atualizadoTs <= ANDAMENTO_VALIDADE_MS;
      o = { id: id, usuario: usuario, fiscal: usuario, turnoId: txt(req.turnoId, 64), placa: placaNorm_(req.placa).slice(0, 8),
            procedimento: PROCEDIMENTOS_TF.indexOf(req.procedimento) >= 0 ? req.procedimento : '', local: txt(req.local), barreira: txt(req.barreira),
            lat: temGps ? lat : (antes ? antes.lat : ''), lon: temGps ? lon : (antes ? antes.lon : ''), estado: 'preenchendo',
            inicioTs: continua ? antes.inicioTs : agora, atualizadoTs: agora };
    }
    const linha = [t.cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; })];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, t.cols.length).setValues(linha);
    else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues(linha);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** TFs em preenchimento agora (estado "preenchendo" com batimento nos últimos 10 min), para o painel. */
function tfsAndamento_(agora) {
  return lerLeitura_('Andamento').filter(function (a) { return a.id && a.estado === 'preenchendo' && agora - a.atualizadoTs <= ANDAMENTO_VALIDADE_MS; })
    .map(function (a) {
      return { id: a.id, usuario: a.usuario, fiscal: a.fiscal, turnoId: a.turnoId, placa: a.placa, procedimento: a.procedimento, local: a.local,
               barreira: a.barreira, lat: numOuNulo_(a.lat), lon: numOuNulo_(a.lon), inicioTs: a.inicioTs, atualizadoTs: a.atualizadoTs };
    });
}

/* ---------- PCE: Termo de Colheita de Amostras (numeração), consulta e arquivos ---------- */

/** Unidade da numeração do Termo de Colheita: sem espaços sobrando e em MAIÚSCULAS (ex.: "MANAUS"). */
function unidadePce_(v) { return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 64); }

/** "NNN/AAAA/UNIDADE" (3 dígitos). */
function numeroTxtPce_(numero, ano, unidade) { return String(numero).padStart(3, '0') + '/' + ano + '/' + unidade; }

/** Último nº usado por "UNIDADE|ano" (todas as unidades/anos já vistos): base para propor número sem internet. */
function ultimosPce_() {
  const regs = lerLeitura_('Colheitas'), o = {};
  regs.forEach(function (r) {
    if (!r.unidade || !r.ano) return;
    const k = r.unidade + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.numero);
  });
  lerLeitura_('Numeracao').forEach(function (r) {
    if (String(r.id).indexOf(SEQUENCIAS.PCE.prefixo) !== 0 || !r.barreira || !r.ano) return;
    const k = r.barreira + '|' + r.ano;
    o[k] = Math.max(o[k] || 0, r.ultimo);
  });
  return o;
}

/** "Qual é o próximo número?" – consulta rápida antes de gerar o termo (não reserva nada). */
function pceProximoNumero_(req) {
  const unidade = unidadePce_(req.unidade), ano = Number(req.ano) || new Date().getFullYear();
  if (!unidade) throw new Error('Informe a unidade.');
  const u = ultimoSeq_('PCE', unidade, ano);
  return { ok: true, unidade: unidade, ano: ano, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoTermo: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}

/** Emissão do Termo de Colheita: grava só se o número ainda estiver livre (sob lock), como no TF. */
function pceEmitir_(req, usuario) {
  const c = req.colheita || {};
  if (Number(c.registroAntigo) === 1) exigirAntigo_(usuario);                  // termo digitado do papel: só com a permissão "Digitar do papel"
  c.unidade = unidadePce_(c.unidade);
  const unidade = c.unidade, ano = Number(c.ano) || 0, numero = Number(c.numero) || 0;
  if (!c.id || !unidade || !ano || numero < 1) throw new Error('Dados do Termo de Colheita incompletos.');
  if (!c.numeroTxt) c.numeroTxt = numeroTxtPce_(numero, ano, unidade);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_('Colheitas');
    const ocupante = todos.filter(function (r) { return r.unidade === unidade && r.ano === ano && r.numero === numero && r.id !== c.id; })[0];
    if (ocupante) {
      const u = ultimoSeq_('PCE', unidade, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (r) { return r.id === c.id; })[0];
    c.emitidoEm = (antes && antes.emitidoEm) || agora;                            // reenvio do mesmo termo não muda a data de emissão
    gravar_('Colheitas', [c], agora, usuario);
    if (req.pessoa) gravar_('Pessoas', [req.pessoa], agora, usuario);
    if (req.propriedade) gravar_('Propriedades', [req.propriedade], agora, usuario);
    return { ok: true, emitido: true, numero: numero, numeroTxt: c.numeroTxt, emitidoEm: c.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- PCE: Cadastro de imóvel (por programa; hoje "moniliase") e Termo de Fiscalização do PCE ----------
 * Numeração como no Termo de Colheita: online o app pergunta o próximo (pceDocNumero) e grava com pceDocRegistrar (só se o número estiver
 * livre, sob lock); sem internet o número é provisório e sobe no sync (número repetido = conflito = 1, como no TF). Registro digitado do
 * papel (registroAntigo = 1, só com a permissão "Digitar do papel"): o número é o do papel (numeroOrigem "papel"); a planilha aceita
 * qualquer número livre e recusa número já usado; o próximo sugerido continua sendo "maior número usado + 1" (padrão do Termo de Colheita). */
const PROGRAMAS_PCE = ['moniliase', 'banana', 'citros', 'mandioca', 'soja', 'propriedade'];
const DOCS_PCE = {
  termo: { aba: 'TermosPCE', seq: 'TPCE', nome: 'Termo de Fiscalização' },
  cadastro: { aba: 'CadastrosPCE', seq: 'CPCE', nome: 'Cadastro de imóvel' }
};
function programaPce_(v) { const s = normPub_(v).replace(/ /g, ''); return PROGRAMAS_PCE.indexOf(s) >= 0 ? s : 'moniliase'; }
function tipoDocPce_(v) { if (v !== 'termo' && v !== 'cadastro') throw new Error('Tipo de documento do PCE inválido.'); return v; }
/** Termo "001.2026.AUTAZES"; Cadastro "001-2026-AUTAZES". */
function numeroTxtDocPce_(tipo, numero, ano, unidade) {
  const n = String(numero).padStart(3, '0');
  return tipo === 'termo' ? n + '.' + ano + '.' + unidade : n + '-' + ano + '-' + unidade;
}
function grupoDocPce_(tipo, unidade, programa) { return tipo === 'termo' ? unidade : String(programa || 'moniliase').toUpperCase() + '|' + unidade; }
/** Último nº usado por chave (base para o número provisório sem internet): "T|UNIDADE|ano" (termo) e "C|PROGRAMA|UNIDADE|ano" (cadastro). */
function ultimosDocPce_() {
  const o = {}, num = lerLeitura_('Numeracao');
  [['termo', 'T|'], ['cadastro', 'C|']].forEach(function (x) {
    const D = DOCS_PCE[x[0]], seq = SEQUENCIAS[D.seq];
    lerLeitura_(D.aba).forEach(function (r) {
      if (!r.unidade || !r.ano) return;
      const k = x[1] + grupoSeq_(D.seq, r) + '|' + r.ano;
      o[k] = Math.max(o[k] || 0, r.numero);
    });
    num.forEach(function (r) {
      if (String(r.id).indexOf(seq.prefixo) !== 0 || !r.barreira || !r.ano) return;
      const k = x[1] + r.barreira + '|' + r.ano;
      o[k] = Math.max(o[k] || 0, r.ultimo);
    });
  });
  return o;
}
/** "Qual é o próximo número?" do Termo de Fiscalização (unidade/ano) ou do Cadastro (programa/unidade/ano). Não reserva nada. */
function pceDocNumero_(req) {
  const tipo = tipoDocPce_(req.tipo), unidade = unidadePce_(req.unidade), ano = Number(req.ano) || new Date().getFullYear(), programa = programaPce_(req.programa);
  if (!unidade) throw new Error('Informe a unidade.');
  const u = ultimoSeq_(DOCS_PCE[tipo].seq, grupoDocPce_(tipo, unidade, programa), ano);
  return { ok: true, tipo: tipo, unidade: unidade, ano: ano, programa: programa, ultimo: u.ultimo, proximo: u.ultimo + 1,
           ultimoReg: u.ref ? { numeroTxt: u.ref.numeroTxt, data: u.ref.data, hora: u.ref.hora, usuario: u.ref.usuario } : null };
}
/** Prepara o registro recebido do app: unidade em maiúsculas, programa válido e nº em texto no formato do papel. */
function normalizarDocPce_(tipo, r) {
  r.unidade = unidadePce_(r.unidade);
  if (tipo === 'cadastro') r.programa = programaPce_(r.programa);
  else r.programa = r.programa ? programaPce_(r.programa) : '';
  if (Number(r.numero) > 0 && Number(r.ano) > 0) r.numeroTxt = numeroTxtDocPce_(tipo, Number(r.numero), Number(r.ano), r.unidade);
  return r;
}
/** Grava o Termo/Cadastro só se o número ainda estiver livre (sob lock). Também grava o produtor e a propriedade. */
function pceDocRegistrar_(req, usuario) {
  const tipo = tipoDocPce_(req.tipo), D = DOCS_PCE[tipo], r = normalizarDocPce_(tipo, req.registro || {});
  if (Number(r.registroAntigo) === 1) exigirAntigo_(usuario);                     // digitado do papel: só com a permissão "Digitar do papel"
  const unidade = r.unidade, ano = Number(r.ano) || 0, numero = Number(r.numero) || 0, grupo = grupoDocPce_(tipo, unidade, r.programa);
  if (!r.id || !unidade || !ano || numero < 1) throw new Error('Dados do ' + D.nome + ' incompletos.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerLeitura_(D.aba);
    const ocupante = todos.filter(function (x) { return grupoSeq_(D.seq, x) === grupo && x.ano === ano && x.numero === numero && x.id !== r.id && x.excluido !== 1; })[0];
    if (ocupante) {
      const u = ultimoSeq_(D.seq, grupo, ano, todos);
      return { ok: true, emitido: false, ocupadoPor: { numeroTxt: ocupante.numeroTxt, data: ocupante.data, hora: ocupante.hora, usuario: ocupante.usuario, nome: ocupante.nome },
               ultimo: u.ultimo, proximo: u.ultimo + 1 };
    }
    const agora = Date.now(), antes = todos.filter(function (x) { return x.id === r.id; })[0];
    r.emitidoEm = (antes && antes.emitidoEm) || agora;
    gravar_(D.aba, [r], agora, usuario);
    if (req.pessoa) gravar_('Pessoas', [req.pessoa], agora, usuario);
    if (req.propriedade) gravar_('Propriedades', [req.propriedade], agora, usuario);
    return { ok: true, emitido: true, numero: numero, numeroTxt: r.numeroTxt, emitidoEm: r.emitidoEm, srv_ts: agora };
  } finally {
    lock.releaseLock();
  }
}

/** Cadastro do produtor (pessoa + propriedades) e quantos levantamentos/termos já existem para o CPF/CNPJ. */
function pceConsultar_(req, usuario) {
  const doc = digitos_(req.doc);
  if (doc.length !== 11 && doc.length !== 14) throw new Error('Informe um CPF/CNPJ completo.');
  const pessoa = lerLeitura_('Pessoas').filter(function (p) { return p.id === doc; })[0];
  const propriedades = lerLeitura_('Propriedades').filter(function (p) { return digitos_(p.doc) === doc; })
    .map(function (p) { return { id: p.id, codigo: p.codigo, nome: p.nome, doc: p.doc, municipio: p.municipio, situacaoFundiaria: p.situacaoFundiaria, lat: p.lat, lon: p.lon,
                                 cnpj: p.cnpj, empresa: p.empresa, endereco: p.endereco, uf: p.uf, viaAcesso: p.viaAcesso, comercial: p.comercial, tipoPropriedade: p.tipoPropriedade }; });
  const levantamentos = lerLeitura_('Levantamentos').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1; }).length;
  const colheitas = lerLeitura_('Colheitas').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1 && r.cancelado !== 1; }).length;
  const cadastros = lerLeitura_('CadastrosPCE').filter(function (r) { return digitos_(r.doc) === doc && r.excluido !== 1; })
    .map(function (r) { const o = {}; TABELAS.CadastrosPCE.forEach(function (c) { if (c !== 'srv_ts' && c !== 'usuario') o[c] = r[c]; }); o.pendente = 0; return o; });
  const achou = pessoa || propriedades.length || levantamentos || colheitas || cadastros.length;
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, doc.slice(0, 3) + '***' + doc.slice(-2), '', achou ? 'PCE: encontrado' : 'PCE: novo']]);
  return {
    ok: true,
    pessoa: pessoa ? { id: pessoa.id, tipo: pessoa.tipo, nome: pessoa.nome, rg: pessoa.rg, endereco: pessoa.endereco, municipio: pessoa.municipio,
                       uf: pessoa.uf, telefone: pessoa.telefone, email: pessoa.email } : null,
    propriedades: propriedades, levantamentos: levantamentos, colheitas: colheitas, cadastrosPce: cadastros
  };
}

/* ---------- PCE em campo: dados do(s) município(s) para consultar sem internet ---------- */
const CAMPO_MAX_PROPS = 5000;                   // propriedades por chamada (resposta de ~1,5 MB)
// campos que não vão para o aparelho: técnicos da planilha e nomes que o app usa para controle local
const CAMPO_FORA = ['srv_ts', 'usuario', 'pendente', 'campoMun', 'resumoLev', 'baixadoEm', 'excluido', 'cadastrosPce', 'ultimoTermoPce'];

/**
 * Todas as colunas da aba (as do sistema e as acrescentadas à mão, pelo cabeçalho), sem as técnicas: colunas novas da ficha ou do
 * cadastro de propriedade chegam ao aparelho sem mudar o código. Leitura pura (não cria aba nem coluna).
 */
function lerTodasColunas_(nome) {
  const sh = planilha_().getSheetByName(nome), base = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  const nc = Math.max(base.length, Number(sh.getLastColumn ? sh.getLastColumn() : 0) || 0);
  const cab = sh.getRange(1, 1, 1, nc).getValues()[0].map(function (c) { return String(c === null || c === undefined ? '' : c).trim(); });
  return sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues().map(function (l) {
    const o = {};
    cab.forEach(function (c, i) {
      if (!c || CAMPO_FORA.indexOf(c) >= 0 || Object.prototype.hasOwnProperty.call(o, c)) return;
      let v = l[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'America/Manaus', 'yyyy-MM-dd');
      o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v === null || v === undefined ? '' : v);
    });
    return o;
  });
}

/** Pragas detectadas/suspeitas de um levantamento (campo "pragas" ou, nos registros anteriores, "culturas"). */
function deteccoesLev_(r) {
  const out = {}, p = lerJSONSeguro_(r.pragas, null);
  if (Array.isArray(p) && p.length) {
    p.forEach(function (g) {
      ((g && g.culturas) || []).forEach(function (c) {
        if (c && (c.resultado === 'detectada' || c.resultado === 'suspeita')) {
          const k = String(g.praga || '').trim() || 'Praga não informada';
          if (out[k] !== 'detectada') out[k] = c.resultado;
        }
      });
    });
  } else {
    const cs = lerJSONSeguro_(r.culturas, []);
    (Array.isArray(cs) ? cs : []).forEach(function (c) {
      const k = c && String(c.praga || '').trim();
      if (k && out[k] !== 'detectada') out[k] = c.resultado === 'suspeita' ? 'suspeita' : 'detectada';
    });
  }
  return Object.keys(out).map(function (k) { return { praga: k, resultado: out[k] }; });
}

/**
 * "Baixar dados para o campo": propriedades do(s) município(s) (comparação sem acento/maiúsculas), os produtores donos delas (por doc)
 * e, por propriedade, um resumo do histórico (nº de levantamentos, data do último e pragas detectadas/suspeitas nele). Só módulo PCE.
 * Cada download fica registrado na aba Consultas (quem, quando, municípios e quantas propriedades).
 */
function pceBaixarMunicipio_(req, usuario) {
  const pedidos = Array.isArray(req.municipios) ? req.municipios : [];
  if (!pedidos.length) throw new Error('Escolha pelo menos um município.');
  if (pedidos.length > 62) throw new Error('Município(s) inválido(s).');
  const alvo = {};                                                  // nome normalizado → nome como pedido
  pedidos.forEach(function (m) { const s = String(m || '').trim().slice(0, 80), k = normPub_(s); if (k) alvo[k] = s; });
  if (!Object.keys(alvo).length) throw new Error('Escolha pelo menos um município.');
  const props = lerTodasColunas_('Propriedades').filter(function (p) { return p.id && alvo[normPub_(p.municipio)]; });
  if (props.length > CAMPO_MAX_PROPS) {
    throw new Error('São ' + props.length + ' propriedades nesse(s) município(s); o limite é ' + CAMPO_MAX_PROPS.toLocaleString('pt-BR') +
      ' por vez. Baixe menos municípios de cada vez.');
  }
  // histórico: levantamentos ligados à propriedade pelo código ou por produtor (doc) + nome da propriedade
  const chaveCod = function (c) { const s = normPub_(c); return s ? 'C:' + s : ''; };
  const chaveNome = function (doc, nome) { const d = digitos_(doc), n = normPub_(nome); return d && n ? 'N:' + d + '|' + n : ''; };
  const levs = {};
  lerLeitura_('Levantamentos').forEach(function (r) {
    if (!r.id || r.excluido === 1) return;
    [chaveCod(r.codigoPropriedade), chaveNome(r.doc, r.propriedade)].forEach(function (k) { if (k) (levs[k] = levs[k] || []).push(r); });
  });
  const docs = {}, porMun = {};
  props.forEach(function (p) {
    const vistos = {}, lista = [];
    [chaveCod(p.codigo), chaveNome(p.doc, p.nome)].forEach(function (k) {
      (levs[k] || []).forEach(function (r) { if (!vistos[r.id]) { vistos[r.id] = 1; lista.push(r); } });
    });
    lista.sort(function (a, b) { return String(b.data + ' ' + b.hora).localeCompare(String(a.data + ' ' + a.hora)); });
    const ult = lista[0];
    p.resumoLev = { n: lista.length, ultimo: ult ? ult.data : '', ultimoHora: ult ? ult.hora : '', pragas: ult ? deteccoesLev_(ult) : [] };
    const k = normPub_(p.municipio);
    p.campoMun = alvo[k];
    const d = digitos_(p.doc);
    if (d) (docs[d] = docs[d] || {})[alvo[k]] = 1;
    porMun[alvo[k]] = porMun[alvo[k]] || { props: 0, docs: {} };
    porMun[alvo[k]].props++; if (d) porMun[alvo[k]].docs[d] = 1;
  });
  const pessoas = lerTodasColunas_('Pessoas').filter(function (x) { return x.id && docs[digitos_(x.id)]; })
    .map(function (x) { x.campoMun = Object.keys(docs[digitos_(x.id)]); return x; });
  // Cadastros de imóvel do PCE dessas propriedades (para o mapa e para preencher o Termo) e o último Termo de Fiscalização de cada uma
  const porProp = {}; props.forEach(function (p) { porProp[p.id] = p; });
  const excluidos = {}; lerLeitura_('CadastrosPCE').forEach(function (c) { if (c.excluido === 1) excluidos[c.id] = 1; });
  const cadastrosPce = lerTodasColunas_('CadastrosPCE').filter(function (c) { return c.id && !excluidos[c.id] && porProp[c.propriedadeId]; })
    .map(function (c) { c.campoMun = porProp[c.propriedadeId].campoMun; return c; });
  cadastrosPce.forEach(function (c) { const p = porProp[c.propriedadeId]; (p.cadastrosPce = p.cadastrosPce || []).push({ id: c.id, programa: c.programa, numeroTxt: c.numeroTxt, data: c.data }); });
  lerLeitura_('TermosPCE').forEach(function (t) {
    const p = porProp[t.propriedadeId];
    if (!p || t.excluido === 1 || t.cancelado === 1) return;
    if (!p.ultimoTermoPce || String(t.data + ' ' + t.hora) > String(p.ultimoTermoPce.data + ' ' + p.ultimoTermoPce.hora)) {
      p.ultimoTermoPce = { id: t.id, numeroTxt: t.numeroTxt, data: t.data, hora: t.hora, plantasInspecionadas: t.plantasInspecionadas, amostra: t.amostra, sintomas: t.sintomas };
    }
  });
  const municipios = Object.keys(alvo).map(function (k) {
    const m = porMun[alvo[k]] || { props: 0, docs: {} };
    return { municipio: alvo[k], nProps: m.props, nPessoas: Object.keys(m.docs).length };
  });
  const c = aba_('Consultas');
  c.getRange(c.getLastRow() + 1, 1, 1, 5).setValues([[Date.now(), usuario, '', '',
    ('PCE campo: ' + municipios.map(function (m) { return m.municipio + ' (' + m.nProps + ')'; }).join(', ')).slice(0, 480)]]);
  return { ok: true, agora: Date.now(), municipios: municipios, propriedades: props, pessoas: pessoas, cadastrosPce: cadastrosPce };
}

const ARQ_MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
const ARQ_MAX_BYTES = 4 * 1024 * 1024;                 // fotos e assinaturas (o app já reduz as fotos)
const ARQ_MAX_BYTES_PDF = 10 * 1024 * 1024;            // PDF escaneado (registro digitado do papel): ≈ 13,4 MB em base64, bem abaixo do limite do POST
const ARQ_RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Subpasta com esse nome dentro de "pai" (cria se não existir). */
function subpasta_(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/** Pasta "GDV - Arquivos" (id guardado em PASTA_ARQUIVOS nas propriedades do script; recriada se sumir). */
function pastaArquivos_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_ARQUIVOS');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder('GDV - Arquivos');
  props.setProperty('PASTA_ARQUIVOS', nova.getId());
  return nova;
}

/**
 * Recebe UMA foto/assinatura/PDF (base64 sem o prefixo "data:") e grava no Drive, em GDV - Arquivos/PCE/<ano>/<dono> (levantamentos,
 * colheitas) ou GDV - Arquivos/TF/<ano> (dono "tfs": fotos e assinaturas do TF de Barreira; sem PDF).
 * tipo "documento" = PDF escaneado (application/pdf, até 10 MB, conteúdo começando por "%PDF-"); foto/assinatura = JPEG/PNG até 4 MB.
 * Idempotente pelo id: reenvio do mesmo arquivo devolve o registro já gravado. Os arquivos NÃO são compartilhados.
 */
function arquivoEnviar_(req, usuario) {
  const a = req.arquivo || {};
  const id = String(a.id || ''), dono = String(a.dono || ''), donoId = String(a.donoId || ''), tipo = String(a.tipo || '');
  const papel = String(a.papel || ''), mime = String(a.mime || '');
  // foto do levantamento por praga: "praga – cultura" a que a foto pertence (texto livre, só informativo: aba Arquivos e nome no Drive)
  const rotulo = tipo === 'foto' ? String(a.rotulo || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!ARQ_RE_UUID.test(id)) throw new Error('Identificador de arquivo inválido.');
  if (['levantamentos', 'colheitas', 'tfs', 'cadastrosPce', 'termosPce'].indexOf(dono) < 0) throw new Error('Arquivo sem registro de origem válido.');
  if (!donoId || donoId.length > 64) throw new Error('Arquivo sem registro de origem válido.');
  if (tipo !== 'foto' && tipo !== 'assinatura' && tipo !== 'documento') throw new Error('Tipo de arquivo inválido.');
  if (['', 'servidor', 'produtor', 'testemunha1', 'testemunha2', 'fiscalizado'].indexOf(papel) < 0) throw new Error('Papel da assinatura inválido.');
  if (dono === 'tfs' && tipo === 'documento') throw new Error('TF não aceita documento (PDF).');
  if (!ARQ_MIMES[mime]) throw new Error('Formato não aceito (somente JPEG, PNG ou PDF).');
  const pdf = mime === 'application/pdf';
  if (pdf !== (tipo === 'documento')) throw new Error(pdf ? 'PDF só pode ser enviado como documento.' : 'Documento só pode ser PDF.');
  if (pdf && papel) throw new Error('Papel inválido para documento.');
  if (tipo === 'documento') exigirAntigo_(usuario);                                // PDF escaneado: só para registro antigo (Digitar do papel)
  const max = pdf ? ARQ_MAX_BYTES_PDF : ARQ_MAX_BYTES, maxTxt = pdf ? '10 MB' : '4 MB';

  const existente = function () { return lerLeitura_('Arquivos').filter(function (r) { return r.id === id; })[0]; };
  const resposta = function (r) { return { ok: true, id: r.id, url: r.url, driveId: r.driveId, existente: true }; };
  const ja = existente();
  if (ja) return resposta(ja);

  const b64 = String(req.base64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!b64 || b64.length > Math.ceil(max / 3) * 4 + 4) throw new Error('Arquivo vazio ou maior que ' + maxTxt + '.');
  let bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw new Error('Arquivo corrompido (base64 inválido).'); }
  if (!bytes.length || bytes.length > max) throw new Error('Arquivo vazio ou maior que ' + maxTxt + '.');
  const b = function (i) { return bytes[i] & 0xff; };
  const jpeg = b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  const png = b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  const ehPdf = bytes.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d;   // "%PDF-"
  if ((mime === 'image/jpeg' && !jpeg) || (mime === 'image/png' && !png) || (pdf && !ehPdf)) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.');

  const ano = String(new Date().getFullYear());
  const lock = LockService.getScriptLock();
  let pasta, n;
  lock.waitLock(30000);
  try {                                                                     // pastas e numeração do nome sob lock (sem duplicar pastas)
    pasta = dono === 'tfs' ? subpasta_(subpasta_(pastaArquivos_(), 'TF'), ano)          // TF: GDV - Arquivos/TF/<ano>
      : subpasta_(subpasta_(subpasta_(pastaArquivos_(), 'PCE'), ano), dono);
    n = lerLeitura_('Arquivos').filter(function (r) { return r.dono === dono && r.donoId === donoId && r.tipo === tipo; }).length + 1;
  } finally { lock.releaseLock(); }

  const seguro = function (v) { return String(v).replace(/[^A-Za-z0-9_-]/g, '-'); };
  const rotSeguro = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const nome = seguro(donoId) + '_' + tipo + '_' + (papel || n) + (rotSeguro ? '_' + rotSeguro : '') + '_' + id + '.' + ARQ_MIMES[mime];
  const arq = pasta.createFile(Utilities.newBlob(bytes, mime, nome));      // privado: herda o acesso da pasta (somente o dono da planilha)

  let gravado = false;
  try {
    lock.waitLock(30000);
    try {
      const outro = existente();                                            // envio duplicado simultâneo: fica o primeiro
      if (outro) return resposta(outro);
      const sh = aba_('Arquivos'), cols = TABELAS.Arquivos;
      const reg = { id: id, dono: dono, donoId: donoId, tipo: tipo, papel: papel, nome: nome, mime: mime, tamanho: bytes.length,
                    driveId: arq.getId(), url: arq.getUrl(), usuario: usuario, criadoEm: Date.now(), rotulo: rotulo };
      sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setValues([cols.map(function (c) { return reg[c]; })]);
      gravado = true;
      return { ok: true, id: id, url: reg.url, driveId: reg.driveId, existente: false };
    } finally { lock.releaseLock(); }
  } finally {
    // sem linha em Arquivos (duplicado, trava ocupada, erro ao gravar): o arquivo vai para a lixeira, sem deixar cópia órfã no Drive
    if (!gravado) { try { arq.setTrashed(true); } catch (e) { /* segue com o erro original */ } }
  }
}

/* ---------- Painel do administrador (somente leitura) ---------- */

/**
 * O painel é uma página do GitHub Pages (mesmo site do app): web/painel/ (app separado "e-GDV Painel"). Ela chama esta API (doPost) com:
 *   painelAtivar {codigo}            → troca um código de ADMINISTRADOR (6 dígitos, uso único) por {ok, token, nome}
 *   painelDados  {key, de, ate}      → dados do período, já sem dados pessoais desnecessários (documentos mascarados)
 *   painelDados  {key, aoVivo:true, ids:[...]} → só os turnos em andamento (e os de "ids", para saber se encerraram) com seus veículos
 *                                       (atualização automática de 1 em 1 minuto, sem reler TFs, levantamentos e termos)
 *   As duas formas de painelDados trazem também tfsAndamento: TFs sendo preenchidos agora nos aparelhos (aba Andamento).
 *   painelDados também roda o encerramento automático de turnos esquecidos (> 12 h, no máximo 1 vez a cada 10 min) e a forma completa
 *   traz rotinas: {ultimoBackup, backupFalhou, desativadas, ultimoArquivamento} (rodapé do painel) e, quando o período começa antes de
 *   1º/jan do ano anterior e já há arquivo anual desses anos, avisoArquivo (texto) + arquivosAnuais [{ano, url}] (ver arquivamento anual).
 *   painelSair   {key}               → revoga a credencial do administrador (botão Sair)
 *   painelGerarCodigo {key, nome}    → gera um código de ativação de FISCAL (aba Servidores): {ok, nome, codigo, expiraEm}
 *   painelAcessos {key, ocultos}     → lista dos acessos (situação, datas, quem gerou; sem credenciais; código só enquanto aguarda ativação);
 *                                       sem as linhas "removidas da lista" (oculto=1), a não ser com ocultos:true (vêm com oculto:1)
 *   painelOcultarAcesso {key, nome}  → "Remover da lista": marca oculto=1/ocultoPor/ocultoEm nas linhas de FISCAL desse nome (não apaga;
 *                                       recusa se houver aparelho ativo ou código aguardando ativação). Nova chave para o nome = volta à lista.
 *   painelRestaurarAcesso {key, nome} → desfaz o "Remover da lista" (oculto=0)
 *   painelRevogar {key, nome}        → revoga os acessos de FISCAL com esse nome
 *   painelRevogarAdmin {key, nome}   → revoga os acessos de ADMINISTRADOR (painel e TV) com esse nome; o próprio acesso não (botão Sair)
 *   painelPermissoes {key, nome, veiculos, tf, pce, antigo} → módulos em que o FISCAL pode inserir dados (aba Permissoes; pelo menos um
 *                                       entre veiculos/tf/pce; antigo = "Digitar do papel", padrão 0, exige pce=1)
 *   painelGerarCodigo aceita também modulos:{veiculos, tf, pce, antigo} (gravados junto); painelAcessos devolve permissoes de cada fiscal.
 * O código é gerado no menu da planilha: e-GDV → Gerar código de administrador. Credenciais de fiscais não leem o painel,
 * e códigos de administrador não ativam aparelhos de fiscais. A rota antiga "?p=painel" só mostra o novo endereço.
 */
const PAINEL_URL_PADRAO = 'https://evilasionogueiraagro-netizen.github.io/GDV/painel/';
const PAINEL_MAX_DIAS = 366;                 // período máximo de uma consulta
const PAINEL_MAX_REGISTROS = 60000;          // turnos + veículos + TFs + levantamentos + termos devolvidos numa resposta
const PAINEL_MAX_LACUNAS = 200;              // lacunas listadas por sequência na auditoria (o total vem em lacunasTotal)

/** Endereço do painel (Propriedades do script → PAINEL_URL troca o padrão, ex.: outro domínio). */
function painelUrl_() {
  return PropertiesService.getScriptProperties().getProperty('PAINEL_URL') || PAINEL_URL_PADRAO;
}

/** Rota antiga (<URL /exec>?p=painel): página mínima que só aponta para o novo painel. */
function painelHtml_() {
  const url = painelUrl_().replace(/[<>"'&]/g, '');
  const out = HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 16px;line-height:1.5">' +
    '<h2>e-GDV – Painel gerencial</h2><p>O painel do administrador mudou de endereço:</p>' +
    '<p><a href="' + url + '" target="_blank" rel="noopener" style="font-size:1.1rem">' + url + '</a></p>' +
    '<p>Abra o link, digite o código de administrador (e-GDV → Gerar código de administrador, na planilha) e salve o endereço nos favoritos.</p></div>')
    .setTitle('e-GDV – Painel gerencial');
  return out.addMetaTag ? out.addMetaTag('viewport', 'width=device-width, initial-scale=1') : out;
}

/**
 * Valida a credencial do painel e devolve o nome do administrador.
 * Aceita a chave mestra (ACCESS_KEY) e credenciais de perfil "admin"; credencial de fiscal recebe "Acesso restrito".
 */
function adminDoToken_(token) {
  token = String(token || '');
  if (token) {
    const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
    if (mestra && token === mestra) return 'Administrador';
    const t = lerLeitura_('Fiscais');
    for (let i = 0; i < t.length; i++) {
      if (t[i].token !== token || t[i].ativo !== 1) continue;
      if (t[i].perfil === 'admin') return t[i].nome;
      throw new Error('Acesso restrito ao administrador. Entre com um código de administrador (e-GDV → Gerar código de administrador).');
    }
  }
  throw new Error('Sessão do painel inválida ou revogada. Entre com um código de administrador.');
}

/** Botão "Sair" do painel: revoga a credencial de administrador no servidor (a cópia local deixa de valer em qualquer lugar). */
function painelSair(token) {
  token = String(token || '');
  const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (!token || (mestra && token === mestra)) return { ok: true };            // chave mestra não é revogada por aqui
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais');
    for (let i = 0; i < t.valores.length; i++) {
      const f = paraObjeto_(t.cols, t.valores[i]);
      if (!f.token || f.token !== token || f.perfil !== 'admin') continue;    // só credencial de administrador
      f.token = ''; f.ativo = 0;
      t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
      break;
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Aba "Servidores" do painel: chaves de ativação dos fiscais ---------- */

const NOME_SERVIDOR_MAX = 80;
const RE_NOME_SERVIDOR_ = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]*$/;   // letras, espaço, apóstrofo, ponto e hífen (nada de fórmula)
function nomeChave_(v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

/** Nome completo do servidor digitado no painel: espaços normalizados, nome e sobrenome, só letras e pontuação de nome. */
function nomeServidor_(v) {
  const nome = String(v || '').trim().replace(/\s+/g, ' ');
  if (!nome) throw new Error('Informe o nome completo do servidor.');
  if (nome.length > NOME_SERVIDOR_MAX) throw new Error('Nome longo demais (máximo de ' + NOME_SERVIDOR_MAX + ' caracteres).');
  if (!RE_NOME_SERVIDOR_.test(nome)) throw new Error('Use só letras no nome (sem números ou símbolos).');
  if (nome.split(' ').filter(function (p) { return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(p); }).length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  return nome;
}

/**
 * Painel → "Gerar chave de ativação": código de FISCAL (uso único, 7 dias). Códigos de administrador continuam só pelo menu da planilha.
 * modulos (opcional) {veiculos, tf, pce, antigo}: módulos liberados para o servidor, gravados junto (aba Permissoes; pelo menos um).
 */
function painelGerarCodigo(token, nome, modulos) {
  const admin = adminDoToken_(token);
  const n = nomeServidor_(nome);
  const perm = modulos === undefined || modulos === null ? null : modulosValidos_(modulos);   // valida ANTES de gerar o código
  const g = gerarCodigo_(n, 'fiscal', admin);
  const r = { ok: true, nome: g.nome, codigo: g.codigo, expiraEm: g.expiraEm };
  if (perm) r.permissoes = gravarPermissoes_(g.nome, perm, admin);
  return r;
}

/* ---------- Módulos autorizados por servidor (aba Permissoes) ---------- */

const MODULOS = ['veiculos', 'tf', 'pce'];
const NOME_MODULO = { veiculos: 'Educação Sanitária/Fiscalização de Trânsito', tf: 'TF de Barreira', pce: 'PCE' };
// actions do app que pertencem a um módulo (o servidor recusa se o módulo não estiver liberado para quem chama)
const MODULO_DA_ACAO = { tfConsultar: 'tf', tfProximoNumero: 'tf', tfEmitir: 'tf', tfAndamento: 'tf', tfIndiceReincidencia: 'tf',
                         pceProximoNumero: 'pce', pceEmitir: 'pce', pceConsultar: 'pce', pceBaixarMunicipio: 'pce', arquivoEnviar: 'pce',
                         pceDocNumero: 'pce', pceDocRegistrar: 'pce' };
const tudoLiberado_ = function () { return { veiculos: 1, tf: 1, pce: 1, antigo: 0 }; };   // "antigo" (Digitar do papel): desligado por padrão
const MSG_SEM_ANTIGO = 'Sem autorização para digitar registros antigos (do papel). Fale com a gerência.';

/** Célula da aba Permissoes → 0/1. Vazio ou qualquer outro valor = liberado (só "0", "não", "false" bloqueiam). */
function moduloLiberado_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === '0' || s === 'false' || s === 'não' || s === 'nao' || s === 'n' ? 0 : 1;
}

/** Célula "antigo" → 0/1. Ao contrário dos módulos, só "1", "sim", "true" ou "s" autorizam (vazio = não autorizado). */
function antigoLiberado_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'sim' || s === 's' ? 1 : 0;
}

/** Mapa nome normalizado → {veiculos, tf, pce, antigo} (linhas repetidas: vale a última). "antigo" só vale com o PCE liberado. */
function mapaPermissoes_() {
  const m = {};
  lerLeitura_('Permissoes').forEach(function (r) {
    const k = nomeChave_(r.nome);
    if (!k) return;
    const pce = moduloLiberado_(r.pce);
    m[k] = { veiculos: moduloLiberado_(r.veiculos), tf: moduloLiberado_(r.tf), pce: pce, antigo: pce ? antigoLiberado_(r.antigo) : 0 };
  });
  return m;
}

/**
 * Módulos liberados para um usuário (nome do fiscal). Sem linha na aba = três módulos liberados e "antigo" desligado.
 * Chave mestra (ACCESS_KEY, usuário "Administrador") = tudo, inclusive "antigo".
 */
function permissoesDe_(usuario, mapa) {
  if (!usuario || usuario === 'Administrador') { const t = tudoLiberado_(); t.antigo = 1; return t; }
  return (mapa || mapaPermissoes_())[nomeChave_(usuario)] || tudoLiberado_();
}

/** Recusa registro antigo (digitado do papel) / PDF escaneado sem a permissão "antigo". Mensagem sem "revogado"/"inválido". */
function exigirAntigo_(usuario) {
  const perm = permissoesDe_(usuario);
  if (perm.antigo) return perm;
  const e = new Error(MSG_SEM_ANTIGO);
  e.semPermissao = 'antigo'; e.permissoes = perm;
  throw e;
}

/** Recusa a ação de um módulo não liberado. A mensagem não fala em "revogado"/"inválido" (o app trataria como acesso revogado). */
function exigirModulo_(usuario, modulo) {
  const perm = permissoesDe_(usuario);
  if (perm[modulo]) return perm;
  const e = new Error('Sem autorização para o módulo ' + NOME_MODULO[modulo] + '. Fale com a gerência.');
  e.semPermissao = modulo; e.permissoes = perm;
  throw e;
}

/**
 * {veiculos, tf, pce, antigo?} vindos do painel → 0/1, com pelo menos um módulo marcado (só veiculos/tf/pce contam).
 * antigo ("Digitar do papel") exige o PCE: antigo marcado sem PCE é recusado com mensagem clara (o painel já marca o PCE junto).
 * antigo ausente (painel antigo) = mantém o que estiver gravado (se o PCE for tirado, vira 0).
 */
function modulosValidos_(m) {
  if (!m || typeof m !== 'object') throw new Error('Informe os módulos do servidor.');
  const o = {}, sim = function (v) { return v === true || v === 1 || v === '1' ? 1 : 0; };
  MODULOS.forEach(function (k) { o[k] = sim(m[k]); });
  if (!o.veiculos && !o.tf && !o.pce) throw new Error('Marque pelo menos um módulo. Para tirar todo o acesso do servidor, use o botão Revogar.');
  if (m.antigo !== undefined && m.antigo !== null) {
    o.antigo = sim(m.antigo);
    if (o.antigo && !o.pce) throw new Error('“Digitar do papel” só vale com o módulo PCE: marque também o PCE (ou desmarque “Digitar do papel”).');
  }
  return o;
}

/** Grava (ou atualiza) a linha do servidor na aba Permissoes, sob lock. Devolve {veiculos, tf, pce, antigo, atualizadoEm, atualizadoPor}. */
function gravarPermissoes_(nome, perm, autor) {
  const chave = nomeChave_(nome);
  const quem = String(autor || 'planilha').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'planilha';   // texto, nunca fórmula
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Permissoes'), agora = Date.now();
    let idx = -1;
    t.valores.forEach(function (l, i) { if (nomeChave_(l[0]) === chave) idx = i; });
    const antes = idx >= 0 ? antigoLiberado_(t.valores[idx][t.cols.indexOf('antigo')]) : 0;
    const antigo = perm.pce ? (perm.antigo === undefined ? antes : perm.antigo) : 0;      // sem PCE não há "Digitar do papel"
    const o = { nome: idx >= 0 ? String(t.valores[idx][0]) : String(nome).replace(/^[=+\-@\s]+/, ''), veiculos: perm.veiculos, tf: perm.tf, pce: perm.pce,
                atualizadoEm: agora, atualizadoPor: quem, antigo: antigo };
    const linha = [t.cols.map(function (c) { return o[c]; })];
    if (idx >= 0) t.sh.getRange(idx + 2, 1, 1, t.cols.length).setValues(linha);
    else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues(linha);
    return { veiculos: o.veiculos, tf: o.tf, pce: o.pce, antigo: antigo, atualizadoEm: agora, atualizadoPor: quem };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Painel → aba Servidores → caixas "Veículos / TF / PCE / Papel": módulos em que o servidor pode inserir dados (por nome, todos os aparelhos).
 * Só administrador. O servidor precisa existir na aba Fiscais (como fiscal). Pelo menos um módulo; para bloquear tudo, Revogar.
 * "antigo" (Digitar do papel) é opcional, desligado por padrão e exige o PCE marcado (senão: erro pedindo para marcar o PCE).
 */
function painelPermissoes(token, nome, req) {
  const admin = adminDoToken_(token);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const perm = modulosValidos_(req && req.modulos ? req.modulos : req);
  const linhas = lerLeitura_('Fiscais').filter(function (f) { return nomeChave_(f.nome) === nomeChave_(nome); });
  const fiscal = linhas.filter(function (f) { return f.perfil !== 'admin'; })[0];
  if (!fiscal) {
    if (linhas.length) throw new Error('Administrador não tem restrição de módulos.');
    throw new Error('Servidor não encontrado na lista de acessos.');
  }
  const g = gravarPermissoes_(fiscal.nome, perm, admin);
  return { ok: true, nome: fiscal.nome, permissoes: { veiculos: g.veiculos, tf: g.tf, pce: g.pce, antigo: g.antigo }, atualizadoEm: g.atualizadoEm, atualizadoPor: g.atualizadoPor };
}

/**
 * Situação de uma linha da aba Fiscais: revogado (ativo ≠ 1), ativo (aparelho/painel com credencial), aguardando (código válido
 * ainda não usado) ou vencido (código não usado que passou da validade).
 */
function situacaoAcesso_(f, agora) {
  if (f.ativo !== 1) return 'revogado';
  if (f.token) return 'ativo';
  if (f.codigo !== '' && f.expiraEm > agora) return 'aguardando';
  return f.codigo !== '' ? 'vencido' : 'revogado';
}

/**
 * Lista dos acessos para o painel. Nunca devolve credencial (token). O código só vai para fiscal aguardando ativação (para reenviar).
 * Administradores entram só com nome e situação. "criadoEm" = validade − 7 dias (o código sempre nasce com 7 dias).
 */
function painelAcessos(token, ocultos) {
  adminDoToken_(token);
  const comOcultos = ocultos === true || ocultos === 1 || ocultos === '1';
  const agora = Date.now(), mapa = mapaPermissoes_();
  // aparelhos por servidor (nome): o mais recente + quantos; vai na linha "ativo" mais recente do servidor
  const aps = {};
  lerAparelhos_().forEach(function (ap) { (aps[nomeChave_(ap.usuario)] = aps[nomeChave_(ap.usuario)] || []).push(ap); });
  const comAparelho = {};
  const lista = lerLeitura_('Fiscais').filter(function (f) { return f.nome && (comOcultos || f.oculto !== 1 || f.perfil === 'admin'); }).map(function (f) {
    const situacao = situacaoAcesso_(f, agora);
    if (f.perfil === 'admin') return { nome: f.nome, perfil: 'admin', situacao: situacao };
    const o = { nome: f.nome, perfil: 'fiscal', situacao: situacao, criadoEm: f.expiraEm > VALIDADE_CODIGO_MS ? f.expiraEm - VALIDADE_CODIGO_MS : 0,
                expiraEm: f.expiraEm > VALIDADE_CODIGO_MS ? f.expiraEm : 0, ativadoEm: f.ativadoEm > 1e12 ? f.ativadoEm : 0, geradoPor: f.geradoPor || '',
                permissoes: permissoesDe_(f.nome, mapa) };                                     // módulos liberados (por nome; padrão: todos, "antigo" desligado)
    if (situacao === 'aguardando') o.codigo = f.codigo.padStart(6, '0');
    if (f.oculto === 1) o.oculto = 1;                                                 // só com ocultos:true ("Mostrar removidos")
    return o;
  });
  lista.filter(function (o) { return o.perfil === 'fiscal' && o.situacao === 'ativo' && !o.oculto; })
    .sort(function (a, b) { return (b.ativadoEm || 0) - (a.ativadoEm || 0); })
    .forEach(function (o) {
      const k = nomeChave_(o.nome), l = aps[k];
      if (!l || comAparelho[k]) return;
      comAparelho[k] = true;
      const ult = l.slice().sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; })[0];
      o.aparelho = resumoAparelho_(ult); o.nAparelhos = l.length;
      o.aparelhos = l.map(resumoAparelho_).sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; }).slice(0, 10);
    });
  lista.sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0) || String(a.nome).localeCompare(String(b.nome)); });
  return { ok: true, agora: agora, acessos: lista };
}

/** Painel → "Revogar": tira todos os acessos de FISCAL com esse nome (aparelhos e códigos). Administrador: painelRevogarAdmin. */
function painelRevogar(token, nome) {
  adminDoToken_(token);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const n = revogar_(nome, 'fiscal');
  if (!n && lerLeitura_('Fiscais').some(function (f) { return f.perfil === 'admin' && f.ativo === 1 && nomeChave_(f.nome) === nomeChave_(nome); })) {
    throw new Error(nome + ' é administrador: marque "Mostrar administradores" e use o Revogar da linha de administrador.');
  }
  return { ok: true, nome: nome, revogados: n };
}

/**
 * Painel → "Revogar" na linha de um administrador: tira os acessos de ADMINISTRADOR com esse nome (painel e TV; credenciais e
 * códigos ainda não usados). Não toca em acessos de fiscal do mesmo nome. O próprio acesso não sai por aqui (use Sair), para
 * ninguém se trancar fora do painel. Novo acesso de administrador continua só pelo menu da planilha.
 */
function painelRevogarAdmin(token, nome) {
  const admin = adminDoToken_(token);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do administrador.');
  if (nomeChave_(nome) === nomeChave_(admin)) throw new Error('Este é o seu próprio acesso. Para sair do painel, use o botão Sair.');
  return { ok: true, nome: nome, revogados: revogar_(nome, 'admin') };
}

/**
 * Painel → "Remover da lista" (restaurar = false) ou "Restaurar" (true) um servidor revogado/com código vencido.
 * Não apaga nada (auditoria): marca oculto = 1, ocultoPor (administrador) e ocultoEm nas linhas de FISCAL desse nome; restaurar volta
 * oculto = 0 (ocultoPor/ocultoEm ficam como registro da última remoção). Recusa ocultar quem ainda tem aparelho ativo ou código
 * aguardando ativação. Uma chave nova para o mesmo nome nasce sem oculto, e o servidor volta à lista normalmente.
 */
function painelOcultarAcesso(token, nome, restaurar) {
  const admin = adminDoToken_(token);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const chave = nomeChave_(nome), quem = String(admin || 'Administrador').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'Administrador';
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'), agora = Date.now(), linhas = [];
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if (f.perfil !== 'admin' && nomeChave_(f.nome) === chave) linhas.push({ i: i, f: f });
    });
    if (!linhas.length) throw new Error('Servidor não encontrado na lista: ' + nome + '.');
    if (!restaurar) {
      const vivos = linhas.filter(function (x) { const s = situacaoAcesso_(x.f, agora); return s === 'ativo' || s === 'aguardando'; });
      if (vivos.length) {
        throw new Error(linhas[0].f.nome + ' ainda tem ' + (vivos.some(function (x) { return situacaoAcesso_(x.f, agora) === 'ativo'; }) ? 'acesso ativo' : 'código aguardando ativação') +
          '. Só sai da lista quem está revogado ou com código vencido: revogue o acesso antes.');
      }
    }
    let n = 0;
    linhas.forEach(function (x) {
      const f = x.f;
      if (restaurar ? f.oculto !== 1 : f.oculto === 1) return;
      if (restaurar) f.oculto = 0; else { f.oculto = 1; f.ocultoPor = quem; f.ocultoEm = agora; }
      t.sh.getRange(x.i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
      n++;
    });
    return restaurar ? { ok: true, nome: linhas[0].f.nome, restaurados: n } : { ok: true, nome: linhas[0].f.nome, ocultos: n };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Painel → "Encerrar turno" (barreira esquecida aberta no aparelho) ---------- */

const RE_HM_ = /^([01]\d|2[0-3]):[0-5]\d$/;
const ENCERRAR_TOLERANCIA_MS = 2 * 3600 * 1000;   // fuso do oeste do AM (UTC−5) e relógio do aparelho adiantado

/**
 * O gerente encerra um turno que ficou aberto (o fiscal diz que encerrou, mas o encerramento não chegou à planilha).
 * Só administrador. fim = "HH:MM" informado no painel; antes do início = dia seguinte (turno que passou da meia-noite).
 * Grava encerrado = 1, fim, encerradoPor/encerradoEm e atualizadoEm/srv_ts = agora: o aparelho do fiscal recebe o encerramento
 * na próxima sincronização, e um envio antigo do aparelho (encerrado = 0) não reabre o turno (ver gravar_).
 */
function painelEncerrarTurno(token, turnoId, fim) {
  const admin = adminDoToken_(token);
  const id = String(turnoId === null || turnoId === undefined ? '' : turnoId).trim();
  if (!id || id.length > 64) throw new Error('Turno não informado.');
  fim = String(fim === null || fim === undefined ? '' : fim).trim();
  if (!RE_HM_.test(fim)) throw new Error('Horário de encerramento inválido. Use o formato HH:MM (ex.: 17:30).');
  const quem = String(admin || 'Administrador').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'Administrador';   // texto, nunca fórmula
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Turnos'), cols = t.cols;
    let idx = -1;
    t.valores.forEach(function (l, i) { if (String(l[0]) === id) idx = i; });
    if (idx < 0) throw new Error('Turno não encontrado na planilha. Atualize o painel e tente de novo.');
    const o = paraObjeto_(cols, t.valores[idx]);
    if (o.encerrado === 1) {
      throw new Error('Este turno já está encerrado' + (o.fim ? ' (fim ' + o.fim + ')' : '') + (o.encerradoPor ? ', encerrado por ' + o.encerradoPor : ' pelo fiscal') + '.');
    }
    const ini = tsManaus_(o.data, o.inicio), agora = Date.now();
    let fimTs = tsManaus_(o.data, fim);
    if (fimTs !== null && ini !== null && fimTs < ini) fimTs += 864e5;                // passou da meia-noite
    if (fimTs !== null && fimTs > agora + ENCERRAR_TOLERANCIA_MS) {
      throw new Error('O horário de encerramento (' + fim + ') ainda não chegou. Um horário antes do início do turno (' + o.inicio + ') conta como o dia seguinte.');
    }
    const novo = { encerrado: 1, fim: fim, atualizadoEm: agora, srv_ts: agora, encerradoPor: quem, encerradoEm: agora };
    const linha = cols.map(function (c, i) { return c in novo ? novo[c] : t.valores[idx][i]; });
    t.sh.getRange(idx + 2, 1, 1, cols.length).setValues([linha]);
    return { ok: true, turno: { id: id, data: o.data, inicio: o.inicio, fim: fim, encerrado: 1, inicioTs: ini, fimTs: fimTs,
                                encerradoPor: quem, encerradoEm: agora, atualizadoEm: agora, srv_ts: agora } };
  } finally {
    lock.releaseLock();
  }
}

/** Troca o código de administrador por uma credencial (limitador de tentativas próprio, mais restrito que o dos aparelhos). */
function painelAtivar(codigo) {
  return ativar_({ codigo: codigo, perfil: 'admin' });
}

function lerLeitura_(nome) {                       // leitura pura: não cria abas nem colunas
  const sh = planilha_().getSheetByName(nome), cols = TABELAS[nome];
  if (!sh || sh.getLastRow() < 2) return [];
  const linhas = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map(function (l) { return paraObjeto_(cols, l); });
  // painel e relatórios: a mesma BVA fixa com um nome só (no volante o local é o endereço e fica como está)
  if (nome === 'Turnos') linhas.forEach(function (t) { const p = normPub_(t.posto); if (p.indexOf('mov') < 0 && p.indexOf('volante') < 0) t.local = localCanon_(t.local); });
  return linhas;
}

/**
 * Nomes diferentes da mesma BVA fixa (turnos antigos digitados à mão, cadastro de barreiras do TF) → o nome do app (CONFIG.bvas).
 * Vale só na leitura (painel, relatórios, convênio, VIGIFITO, página pública): a planilha e os aparelhos ficam como estão.
 * Compara sem acento/caixa/pontuação e sem as palavras "BVA", "Barreira", "da/de/do": "BVA Porto da Ceasa" = "Barreira Porto CEASA".
 */
const BVA_APELIDOS_ = {
  'BVA - CEASA': ['Porto da CEASA', 'BR-319 Porto da CEASA']
};
function chaveBva_(s) {
  return normPub_(s).split(' ').filter(function (w) { return w && !/^(bva|barreira|da|de|do|das|dos)$/.test(w); }).join(' ');
}
let apelidosBva_ = null;
function localCanon_(local) {
  if (!apelidosBva_) {
    apelidosBva_ = {};
    Object.keys(BVA_APELIDOS_).forEach(function (nome) {
      [nome].concat(BVA_APELIDOS_[nome]).forEach(function (a) { const k = chaveBva_(a); if (k) apelidosBva_[k] = nome; });
    });
  }
  const k = chaveBva_(local);
  return (k && apelidosBva_[k]) || local;
}
/** Barreira do cadastro do TF que é uma BVA do app (pelo id, nome, sufixo ou local) → o nome da BVA; senão ''. */
function bvaDoCadastro_(b) {
  const nomes = [b.sufixo, b.nome, b.id, b.local];
  for (let i = 0; i < nomes.length; i++) { const c = localCanon_(nomes[i]); if (c && c !== nomes[i] || BVA_APELIDOS_[c]) return c; }
  return '';
}

/* --- auxiliares do painel (sem efeitos colaterais) --- */

const RE_DIA_ = /^\d{4}-\d{2}-\d{2}$/;
/** "aaaa-mm-dd" + n dias (calendário puro, sem fuso). */
function somarDias_(dia, n) {
  const d = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))) + n * 864e5);
  return d.toISOString().slice(0, 10);
}
function diaValido_(v) { return RE_DIA_.test(String(v || '')) && somarDias_(v, 0) === v; }
function hojeManaus_() { return Utilities.formatDate(new Date(), 'America/Manaus', 'yyyy-MM-dd'); }
/** Data + "HH:MM" do horário de Manaus (UTC−4, sem horário de verão) → milissegundos; null se faltar algo. */
function tsManaus_(dia, hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
  if (!diaValido_(dia) || !m) return null;
  return Date.parse(dia + 'T' + m[1].padStart(2, '0') + ':' + m[2] + ':00-04:00');
}
function numOuNulo_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function lerJSONSeguro_(v, padrao) {
  try { const o = JSON.parse(String(v || '')); return o === null || o === undefined ? padrao : o; } catch (e) { return padrao; }
}
/** CPF → "***.456.789-**"; CNPJ → "**.345.678/0001-**"; outro valor → "***" (vazio continua vazio). */
function mascararDoc_(v) {
  const d = digitos_(v);
  if (d.length === 11) return '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**';
  if (d.length === 14) return '**.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-**';
  return String(v || '').trim() ? '***' : '';
}
function tipoDoc_(v) { const n = digitos_(v).length; return n === 11 ? 'CPF' : n === 14 ? 'CNPJ' : ''; }
/** Quantidade "1.234,5" / "1234.5" / "12" → número; null se não der para ler. */
function quantidade_(q) {
  let s = String(q || '').trim();
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');      // "1.500" = mil e quinhentos (separador de milhar do pt-BR)
  const n = Number(s);
  return isFinite(n) ? n : null;
}
/** Produtos do TF: o app grava JSON ["PRODUTO - 10 Kg", ...] (aceita também [{p,q,u}] e texto solto). */
function produtosTF_(v) {
  const bruto = lerJSONSeguro_(v, null);
  const lista = Array.isArray(bruto) ? bruto : (String(v || '').trim() ? String(v).split(/\s*[;\n]\s*/) : []);
  return lista.map(function (x) {
    if (x && typeof x === 'object') {
      const p = String(x.p || x.produto || '').trim(), q = String(x.q || x.quantidade || '').trim(), u = String(x.u || x.unidade || '').trim();
      return { produto: p, quantidade: quantidade_(q), unidade: u, texto: (p + (q ? ' - ' + q + ' ' + u : '')).trim() };
    }
    const t = String(x || '').trim(), m = /^(.*?)\s+-\s+([\d.,]+)\s*(.*)$/.exec(t);
    return m ? { produto: m[1].trim(), quantidade: quantidade_(m[2]), unidade: m[3].trim(), texto: t }
             : { produto: t, quantidade: null, unidade: '', texto: t };
  }).filter(function (p) { return p.produto; });
}
/** Documentos apresentados no TF (JSON {nf, ptv, gta, ...}): só os tipos preenchidos, sem os números. */
function documentosTF_(v) {
  const o = lerJSONSeguro_(v, {});
  return o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).filter(function (k) { return String(o[k] || '').trim(); }) : [];
}
function contarFotos_(v) { const a = lerJSONSeguro_(v, []); return Array.isArray(a) ? a.filter(Boolean).length : 0; }
function contarAssinaturas_(v) {
  const o = lerJSONSeguro_(v, {});
  return o && typeof o === 'object' ? Object.keys(o).filter(function (k) { return o[k]; }).length : 0;
}
/* ---------- PCE: levantamento por praga/doença ----------
 * Coluna "pragas" (JSON [{praga, culturas:[{cultura, area, espLinha, espPlanta, resultado, coleta, tipoMaterial, codigoAmostra, destinoAmostra, fotos}]}]),
 * resultado = detectada | nao_detectada | suspeita. Registro anterior (sem "pragas"): cada cultura da coluna "culturas" vira um item da praga
 * dela (resultado "detectada") ou da praga '' = "Sem praga informada" (resultado "nao_detectada"). Detectada e suspeita contam como detecção. */
const RESULTADOS_PCE = ['detectada', 'nao_detectada', 'suspeita'];
/* Formulário de cítricos no levantamento (coluna "citros"): códigos das opções iguais aos de CONFIG.PCE.citros (web/js/config.js). */
const CITROS_ = {
  naoComercial: ['sitio', 'residencia', 'vegetacao', 'publica', 'outros'],
  atividades: ['viveiro_mudas', 'viveiro_semorigem', 'viveiro_portaenxerto', 'viveiro_clonal', 'frutos', 'outros'],
  situacoes: ['proprietario', 'arrendatario', 'cooperativa', 'outras'],
  formasEntrega: ['saco', 'caixa', 'granel'], compradores: ['atravessador', 'supermercado', 'feira', 'cooperativa', 'outros'],
  materiais: ['muda', 'borbulha', 'cavalinho', 'semente'], delimitacao: ['pintapreta'], deteccao: ['cancro', 'hlb', 'acaro'],
  maxCulturas: 20, maxTexto: 200
};
/**
 * Dados de citros recebidos do app → texto JSON gravado (ou '' se nada preenchido / inválido). Só as chaves conhecidas; opções fora da
 * lista viram ''; textos com até 200 caracteres (sem quebra de linha nem "=+-@" no início); números ≥ 0 (negativo ou inválido = vazio;
 * idade e plantas inteiros); no máximo 20 linhas na cultura do citros (as demais são descartadas). cnpj/endereco/uf (app da versão anterior,
 * hoje colunas do levantamento) só se vierem preenchidos: CNPJ só com 14 dígitos; UF com 2 letras. deteccao.tem: sim = presença, nao = ausência.
 */
function citrosTexto_(v) {
  const o = v && typeof v === 'object' ? v : lerJSONSeguro_(v, null);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return '';
  const X = CITROS_, t = function (x) { return textoCurto_(x, X.maxTexto); };
  const um = function (x, l) { return l.indexOf(x) >= 0 ? x : ''; }, sn = function (x) { return um(x, ['sim', 'nao']); };
  const varios = function (x, l) { return (Array.isArray(x) ? x : []).filter(function (y, i, a) { return l.indexOf(y) >= 0 && a.indexOf(y) === i; }); };
  const num = function (x, inteiro) {
    if (x === '' || x === null || x === undefined) return '';
    const n = Number(String(x).replace(',', '.'));
    if (!isFinite(n) || n < 0) return '';
    return inteiro ? Math.round(n) : Math.round(n * 1000) / 1000;
  };
  const sub = function (x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; };
  const culturas = (Array.isArray(o.culturas) ? o.culturas : []).filter(function (c) { return c && typeof c === 'object'; }).map(function (c) {
    return { atividade: um(c.atividade, X.atividades), cultivar: t(c.cultivar), area: num(c.area), idade: num(c.idade, true), plantas: num(c.plantas, true), producao: num(c.producao) };
  }).filter(function (c) { return Object.keys(c).some(function (k) { return c[k] !== ''; }); }).slice(0, X.maxCulturas);
  const delimitacao = {}, deteccao = {}, dl = sub(o.delimitacao), dt = sub(o.deteccao);
  X.delimitacao.forEach(function (k) { const d = sub(dl[k]); delimitacao[k] = { tem: sn(d.tem), tempo: t(d.tempo), controle: sn(d.controle), qual: t(d.qual) }; });
  X.deteccao.forEach(function (k) { const d = sub(dt[k]); deteccao[k] = { tem: sn(d.tem), tempo: t(d.tempo) }; });
  const cnpj = digitos_(o.cnpj), rt = sub(o.rt);
  const r = { v: 1, comercial: sn(o.comercial), naoComercial: um(o.naoComercial, X.naoComercial), naoComercialOutros: t(o.naoComercialOutros),
              cnpj: cnpj.length === 14 ? cnpj : '', endereco: t(o.endereco), uf: String(o.uf || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
              atividades: varios(o.atividades, X.atividades), atividadeOutros: t(o.atividadeOutros), situacao: um(o.situacao, X.situacoes), situacaoOutras: t(o.situacaoOutras),
              culturas: culturas, entrega: sn(o.entrega), formasEntrega: varios(o.formasEntrega, X.formasEntrega), compradores: varios(o.compradores, X.compradores),
              compradorOutros: t(o.compradorOutros), beneficia: sn(o.beneficia), beneficiaTipo: t(o.beneficiaTipo), materiais: varios(o.materiais, X.materiais),
              origemMaterial: t(o.origemMaterial), delimitacao: delimitacao, deteccao: deteccao, rt: { nome: t(rt.nome), conselho: t(rt.conselho) } };
  const temAlgo = function (x) {
    if (Array.isArray(x)) return x.some(temAlgo);
    if (x && typeof x === 'object') return Object.keys(x).some(function (k) { return k !== 'v' && temAlgo(x[k]); });
    return String(x === null || x === undefined ? '' : x) !== '';
  };
  ['cnpj', 'endereco', 'uf'].forEach(function (k) { if (r[k] === '') delete r[k]; });   // da versão anterior do app (hoje são colunas do levantamento)
  return temAlgo(r) ? JSON.stringify(r) : '';
}
/**
 * Identificação do produtor/propriedade no levantamento (colunas cnpj, empresa, endereco, uf): CNPJ só com 14 dígitos (senão vazio), UF com 2 letras,
 * empresa até 120 e endereço até 200 caracteres. Campo não enviado (app antigo) continua não enviado.
 */
function identLev_(r) {
  if (!r || typeof r !== 'object') return;
  if ('cnpj' in r) { const d = digitos_(r.cnpj); r.cnpj = d.length === 14 ? d : ''; }
  if ('uf' in r) r.uf = String(r.uf || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if ('empresa' in r) r.empresa = textoCurto_(r.empresa, 120);
  if ('endereco' in r) r.endereco = textoCurto_(r.endereco, 200);
}
function culturaPce_(c, resultado) {
  return { cultura: String(c.cultura).trim(), area: numOuNulo_(c.area), espLinha: String(c.espLinha || ''), espPlanta: String(c.espPlanta || ''),
           resultado: resultado, coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', tipoMaterial: String(c.tipoMaterial || ''),
           codigoAmostra: String(c.codigoAmostra || ''), destinoAmostra: String(c.destinoAmostra || ''),
           nFotos: Array.isArray(c.fotos) ? c.fotos.filter(Boolean).length : 0 };
}
const temCultura_ = function (c) { return c && typeof c === 'object' && String(c.cultura || '').trim(); };
/** Pragas avaliadas no levantamento (registro inteiro), no formato novo; registros anteriores são convertidos. */
function pragasLev_(r) {
  const p = lerJSONSeguro_(r.pragas, null);
  if (Array.isArray(p) && p.some(function (g) { return g && typeof g === 'object' && Array.isArray(g.culturas) && g.culturas.some(temCultura_); })) {
    return p.filter(function (g) { return g && typeof g === 'object' && Array.isArray(g.culturas); }).map(function (g) {
      return { praga: String(g.praga || '').trim(), culturas: g.culturas.filter(temCultura_).map(function (c) {
        return culturaPce_(c, RESULTADOS_PCE.indexOf(c.resultado) >= 0 ? c.resultado : 'nao_detectada'); }) };
    }).filter(function (g) { return g.culturas.length; });
  }
  const a = lerJSONSeguro_(r.culturas, []), grupos = {}, ordem = [];
  (Array.isArray(a) ? a : []).filter(temCultura_).forEach(function (c) {
    const praga = String(c.praga || c.pragaAvaliada || '').trim();
    const res = RESULTADOS_PCE.indexOf(c.resultado) >= 0 ? c.resultado : (String(c.praga || '').trim() ? 'detectada' : 'nao_detectada');
    if (!grupos[praga]) { grupos[praga] = { praga: praga, culturas: [] }; ordem.push(praga); }
    grupos[praga].culturas.push(culturaPce_(c, res));
  });
  return ordem.map(function (k) { return grupos[k]; });
}
/** Culturas do levantamento, uma por cultura × praga: praga = nome só se detectada/suspeita ('' = não detectada); avaliada = praga do card. */
function culturasLev_(r) {
  const out = [];
  pragasLev_(r).forEach(function (g) {
    g.culturas.forEach(function (c) {
      out.push({ cultura: c.cultura, area: c.area, espLinha: c.espLinha, espPlanta: c.espPlanta, praga: c.resultado === 'nao_detectada' ? '' : g.praga,
                 avaliada: g.praga, resultado: c.resultado, coleta: c.coleta, tipoMaterial: c.tipoMaterial, codigoAmostra: c.codigoAmostra, destinoAmostra: c.destinoAmostra });
    });
  });
  return out;
}
/** Resumo por praga para o painel (sem dados pessoais): [{praga, culturas:[{cultura, area, resultado, coleta}], nFotos}]. */
function pragasPainel_(r) {
  return pragasLev_(r).map(function (g) {
    return { praga: g.praga, nFotos: g.culturas.reduce(function (s, c) { return s + c.nFotos; }, 0),
             culturas: g.culturas.map(function (c) { return { cultura: c.cultura, area: c.area, resultado: c.resultado, coleta: c.coleta }; }) };
  });
}
function pragasDe_(culturas) {
  const vistas = {};
  culturas.forEach(function (c) { if (c.praga) vistas[c.praga] = true; });
  return Object.keys(vistas);
}

/**
 * Resolve o período do painel. Sem datas: últimos 30 dias (até hoje, horário de Manaus). Só "de": até hoje.
 * Só "ate": 30 dias terminando em "ate". Máximo de 366 dias.
 */
function periodoPainel_(filtro) {
  filtro = filtro || {};
  const temDe = String(filtro.de || '') !== '', temAte = String(filtro.ate || '') !== '';
  if ((temDe && !diaValido_(filtro.de)) || (temAte && !diaValido_(filtro.ate))) throw new Error('Período inválido: use datas no formato aaaa-mm-dd.');
  const ate = temAte ? filtro.ate : hojeManaus_();
  const de = temDe ? filtro.de : somarDias_(ate, -29);
  if (de > ate) throw new Error('Período inválido: a data inicial é posterior à data final.');
  const dias = Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 864e5) + 1;
  if (dias > PAINEL_MAX_DIAS) throw new Error('Período longo demais (máximo de ' + PAINEL_MAX_DIAS + ' dias). Escolha um período menor.');
  return { de: de, ate: ate, dias: dias };
}

/** Auditoria de uma sequência a partir de registros já lidos (usada pelo menu e pelo painel). */
function auditarRegs_(tipo, grupo, ano, todos, numeracao) {
  const s = SEQUENCIAS[tipo];
  ano = Number(ano);
  const regs = todos.filter(function (r) { return grupoSeq_(tipo, r) === grupo && r.ano === ano && (tipo === 'TF' || r.numero > 0) && r.excluido !== 1; });
  const usos = {};
  regs.forEach(function (r) { (usos[r.numero] = usos[r.numero] || []).push(r); });
  const nums = Object.keys(usos).map(Number).sort(function (a, b) { return a - b; });
  const base = numeracao.filter(function (r) { return r.id === chaveSeq_(tipo, grupo, ano); })[0];
  const inicio = base ? base.ultimo + 1 : 1, lacunas = [], duplicados = [];
  const maior = nums.length ? nums[nums.length - 1] : inicio - 1;
  for (let n = inicio; n <= maior; n++) if (!usos[n]) lacunas.push(n);
  nums.forEach(function (n) { if (usos[n].length > 1) duplicados.push({ numero: n, ids: usos[n].map(function (r) { return r.usuario + ' ' + r.data + ' ' + r.hora; }) }); });
  const editados = regs.filter(function (r) { return r.numeroOrigem === 'editado' || r.numeroOrigem === 'provisorio' || r.numeroOrigem === 'papel'; }).map(function (r) { return { numero: r.numero, origem: r.numeroOrigem, sugerido: r.numeroSugerido, usuario: r.usuario }; });
  return { total: regs.length, primeiro: nums[0] || null, ultimo: maior || null, inicioEsperado: inicio, lacunas: lacunas, duplicados: duplicados, editados: editados,
           conflitos: regs.filter(function (r) { return r.conflito === 1; }).length, cancelados: regs.filter(function (r) { return r.cancelado === 1; }).length };
}

/**
 * Dados do período para o painel (o painel calcula indicadores, gráficos e mapa no navegador).
 * filtro: {de:'aaaa-mm-dd', ate:'aaaa-mm-dd'}. Turnos em andamento vêm SEMPRE, qualquer que seja o período.
 * Registros excluídos ficam de fora; TFs/termos cancelados vêm com cancelado = 1. Documentos mascarados; sem telefone,
 * e-mail, endereço, RG, matrícula, testemunhas, assinaturas nem ids de fotos (só contagens).
 */
function painelDados(token, filtro) {
  const admin = adminDoToken_(token);
  encerrarTurnosAutomaticoBarato_();                 // turno esquecido aberto há mais de 12 h (antes do gatilho estar ativo, também)
  const r = dadosPainel_(admin, filtro);
  if (!r.aoVivo) {
    r.rotinas = situacaoRotinas_();                  // último backup e último arquivamento (rodapé do painel)
    const av = avisoArquivo_(r.periodo.de);          // período antes do ano anterior: parte dos turnos/veículos está no arquivo anual
    if (av) { r.avisoArquivo = av.texto; r.arquivosAnuais = av.arquivos; }
  }
  return r;
}

/** Corpo do painelDados (sem credencial): usado também pelo relatório mensal. */
function dadosPainel_(admin, filtro) {
  const p = periodoPainel_(filtro), de = p.de, ate = p.ate;
  const noPeriodo = function (r) { return r.data >= de && r.data <= ate; };

  // Barreira (Controle de veículos)
  const aoVivo = filtro && filtro.aoVivo === true, idsVivo = {};
  if (aoVivo) (Array.isArray(filtro.ids) ? filtro.ids : []).slice(0, 500).forEach(function (id) { idsVivo[String(id)] = true; });
  const turnosLidos = lerLeitura_('Turnos').filter(function (t) {
    return t.id && (t.encerrado !== 1 || (aoVivo ? idsVivo[t.id] === true : noPeriodo(t)));
  });
  const porTurno = {};
  turnosLidos.forEach(function (t) { porTurno[t.id] = { n: 0, pessoas: 0, ts: 0, hora: '' }; });
  const veiculos = lerLeitura_('Veiculos').filter(function (v) { return v.id && porTurno[v.turnoId] && v.excluido !== 1; }).map(function (v) {
    const a = porTurno[v.turnoId];
    a.n++; a.pessoas += v.pessoas;
    if (v.srv_ts > a.ts) a.ts = v.srv_ts;
    if (String(v.hora) > a.hora) a.hora = String(v.hora);
    const o = { id: v.id, turnoId: v.turnoId, hora: v.hora, placa: v.placa, tipo: v.tipo, pessoas: v.pessoas, srv_ts: v.srv_ts, usuario: v.usuario };
    if (v.ufOrigem || v.ufDestino) { o.ufOrigem = v.ufOrigem || ''; o.ufDestino = v.ufDestino || ''; }        // origem/destino (opcional)
    if (v.carga === 1) { o.carga = 1; o.produtos = produtosTF_(v.produtos).map(function (p) { return p.texto; }).join('; '); }   // registro antigo
    return o;
  });
  // sinal dos aparelhos: vale para o turno o aparelho do fiscal com este turno aberto (turnoAtual) ou encerrado sem enviar
  // (aparelho de versão antiga, sem sinal próprio, não conta: não se sabe qual turno ele tem aberto)
  const aparelhosPorUsuario = {};
  lerAparelhos_().forEach(function (ap) { (aparelhosPorUsuario[ap.usuario] = aparelhosPorUsuario[ap.usuario] || []).push(ap); });
  const sinalDoTurno = function (t) {
    if (t.encerrado === 1) return null;
    const lst = (aparelhosPorUsuario[t.usuario] || []).filter(function (ap) {
      return !ap.legado && (ap.turnoAtual === t.id || ap.turnosEncerradosPendentes.indexOf(t.id) >= 0);
    });
    if (!lst.length) return null;
    const enc = lst.filter(function (ap) { return ap.turnosEncerradosPendentes.indexOf(t.id) >= 0; });
    const ap = (enc.length ? enc : lst).slice().sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; })[0];
    const o = resumoAparelho_(ap);
    o.ultimoSinal = Math.max.apply(null, lst.map(function (x) { return x.ultimoSinal || 0; }));
    o.encerradoNoCelular = enc.length ? 1 : 0;
    o.fimNoCelular = enc.length ? String(ap.fimPendentes[t.id] || '') : '';
    o.n = lst.length;
    return o;
  };
  const turnos = turnosLidos.map(function (t) {
    const a = porTurno[t.id], ini = tsManaus_(t.data, t.inicio), sa = sinalDoTurno(t);
    let fim = t.fim ? tsManaus_(t.data, t.fim) : null;
    if (fim !== null && ini !== null && fim < ini) fim += 864e5;                       // turno que passou da meia-noite
    return { id: t.id, numeroTF: t.numeroTF, data: t.data, letra: t.letra, inicio: t.inicio, fim: t.fim, fiscal: t.fiscal, local: t.local,
             unidade: t.unidade, posto: t.posto, encerrado: t.encerrado === 1 ? 1 : 0, emAndamento: t.encerrado !== 1, usuario: t.usuario,
             criadoEm: t.criadoEm, atualizadoEm: t.atualizadoEm, srv_ts: t.srv_ts, encerradoPor: t.encerradoPor, encerradoEm: t.encerradoEm || null,
             latIni: numOuNulo_(t.latIni), lngIni: numOuNulo_(t.lngIni), precIni: numOuNulo_(t.precIni),
             latFim: numOuNulo_(t.latFim), lngFim: numOuNulo_(t.lngFim), precFim: numOuNulo_(t.precFim),
             inicioTs: ini, fimTs: fim, nVeiculos: a.n, nPessoas: a.pessoas,
             ultimoVeiculoHora: a.hora, ultimoVeiculoTs: a.ts || null, ultimoSinal: Math.max(t.srv_ts, a.ts, sa ? sa.ultimoSinal : 0) || null,
             aparelho: sa, encerradoNoCelular: sa ? sa.encerradoNoCelular : 0, fimNoCelular: sa ? sa.fimNoCelular : '' };
  });

  const agoraMs = Date.now(), tfsAndamento = tfsAndamento_(agoraMs);                 // TF em preenchimento: vem sempre (normal e ao vivo)
  if (aoVivo) return { ok: true, agora: agoraMs, admin: admin, aoVivo: true, periodo: p, turnos: turnos, veiculos: veiculos, tfsAndamento: tfsAndamento };

  // TF de Barreira
  const todosTFs = lerLeitura_('TFs').filter(function (r) { return r.id; });
  const tfsPer = todosTFs.filter(noPeriodo);
  const tfs = tfsPer.map(function (r) {
    return { id: r.id, barreira: r.barreira, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, emitidoEm: r.emitidoEm, turnoId: r.turnoId, veiculoId: r.veiculoId,
             data: r.data, hora: r.hora, fiscal: r.fiscal, local: r.local, placa: r.placa, origem: r.origem, destino: r.destino,
             ufOrigem: ufNorm_(r.ufOrigem) || ufDoTexto_(r.origem), ufDestino: ufNorm_(r.ufDestino) || ufDoTexto_(r.destino),
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, municipio: r.municipio, uf: r.uf, relacao: r.relacao,
             inspecao: r.inspecao, coleta: r.coleta, amostras: r.amostras, procedimento: r.procedimento, fiel: r.fiel, auto: r.auto,
             advertencia: r.advertencia, documentos: documentosTF_(r.documentos), produtos: produtosTF_(r.produtos),
             reincidente: r.reincidente, tfsAnteriores: r.tfsAnteriores, cancelado: r.cancelado, motivoCancel: r.motivoCancel,
             nFotos: contarFotos_(r.fotos), assinado: contarAssinaturas_(r.assinaturas) ? 1 : 0,   // só contagens: nunca os ids/imagens (LGPD)
             criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  // PCE: levantamentos (período e 365 dias anteriores, para "novo foco" e cobertura) e Termos de Colheita
  const iniHist = somarDias_(de, -365), fimHist = somarDias_(de, -1);
  const levLidos = lerLeitura_('Levantamentos').filter(function (r) { return r.id && r.excluido !== 1; });
  const historicoPce = [], levantamentos = [];
  levLidos.forEach(function (r) {
    if (r.data >= iniHist && r.data <= fimHist) { historicoPce.push({ municipio: r.municipio, data: r.data, pragas: pragasDe_(culturasLev_(r)) }); return; }
    if (!noPeriodo(r)) return;
    const cult = culturasLev_(r);
    levantamentos.push({ id: r.id, data: r.data, hora: r.hora, servidor: r.servidor, cargo: r.cargo, lotacao: r.lotacao,
                         doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, propriedade: r.propriedade,
                         codigoPropriedade: r.codigoPropriedade, situacaoFundiaria: r.situacaoFundiaria, municipio: r.municipio,
                         lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), precisao: numOuNulo_(r.precisao),
                         culturas: cult, pragas: pragasDe_(cult), pragasLev: pragasPainel_(r), nFotos: contarFotos_(r.fotos), nAssinaturas: contarAssinaturas_(r.assinaturas),
                         nDocumentos: contarFotos_(r.documentos), tipoLocal: r.tipoLocal, origemVisita: r.origemVisita,
                         criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario });
  });
  const todasColheitas = lerLeitura_('Colheitas').filter(function (r) { return r.id && r.excluido !== 1; });
  const colPer = todasColheitas.filter(noPeriodo);
  const levPorId = {}; levLidos.forEach(function (r) { levPorId[r.id] = r; });
  const colheitas = colPer.map(function (r) {
    return { id: r.id, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, emitidoEm: r.emitidoEm, levantamentoId: r.levantamentoId,
             data: r.data, hora: r.hora, servidor: r.servidor, lotacao: r.lotacao, municipio: r.municipio,
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome,
             lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), precisao: numOuNulo_(r.precisao),
             cultura: r.cultura, quantidade: r.quantidade, analise: r.analise, partes: r.partes, local: r.local,
             cancelado: r.cancelado, motivoCancel: r.motivoCancel, nFotos: contarFotos_(r.fotos), nDocumentos: contarFotos_(r.documentos),
             laboratorio: labObjeto_(r.laboratorio), pragaTermo: pragaDoTermo_(r, levPorId),
             criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  // PCE: Termos de Fiscalização e Cadastros de imóvel (monilíase…) do período, sem testemunhas, assinaturas nem ids de arquivos
  const todosTermosPce = lerLeitura_('TermosPCE').filter(function (r) { return r.id && r.excluido !== 1; });
  const termosPcePer = todosTermosPce.filter(noPeriodo);
  const termosPce = termosPcePer.map(function (r) {
    return { id: r.id, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido, numeroOrigem: r.numeroOrigem,
             conflito: r.conflito, emitidoEm: r.emitidoEm, propriedadeId: r.propriedadeId, cadastroId: r.cadastroId, programa: r.programa,
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome, atividade: r.atividade, empresa: r.empresa, endereco: r.endereco,
             municipio: r.municipio, uf: r.uf, lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), data: r.data, hora: r.hora,
             servidor: r.servidor, cargo: r.cargo, matricula: r.matricula, lotacao: r.lotacao,
             pragas: lerJSONSeguro_(r.pragas, []), tipoLocal: lerJSONSeguro_(r.tipoLocal, []), acoes: lerJSONSeguro_(r.acoes, []),
             constatacao: r.constatacao, enquadramento: r.enquadramento, plantasInspecionadas: r.plantasInspecionadas,
             amostra: r.amostra, sintomas: r.sintomas, hospedeiros: lerJSONSeguro_(r.hospedeiros, []), cancelado: r.cancelado, motivoCancel: r.motivoCancel,
             nDocumentos: contarFotos_(r.documentos), criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });
  const todosCadastrosPce = lerLeitura_('CadastrosPCE').filter(function (r) { return r.id && r.excluido !== 1; });
  const ligados = {}; termosPce.forEach(function (t) { if (t.cadastroId) ligados[t.cadastroId] = true; });
  const cadPer = todosCadastrosPce.filter(function (r) { return noPeriodo(r) || ligados[r.id]; });
  const cadastrosPce = cadPer.map(function (r) {
    return { id: r.id, programa: r.programa, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, propriedadeId: r.propriedadeId, doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome,
             propriedade: r.propriedade, municipio: r.municipio, uf: r.uf, lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), data: r.data, hora: r.hora,
             servidor: r.servidor, cargo: r.cargo, matricula: r.matricula, lotacao: r.lotacao, local: r.local, dados: lerJSONSeguro_(r.dados, {}),
             totalPlantas: r.totalPlantas, noPeriodo: noPeriodo(r) ? 1 : 0, nDocumentos: contarFotos_(r.documentos), criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario };
  });

  const total = turnos.length + veiculos.length + tfs.length + levantamentos.length + colheitas.length + historicoPce.length + termosPce.length + cadastrosPce.length;
  if (total > PAINEL_MAX_REGISTROS) throw new Error('O período escolhido tem registros demais (' + total + '). Escolha um período menor.');

  // Auditoria da numeração: cada barreira/ano (TF) e unidade/ano (Termo de Colheita) presente no período, sobre TODOS os registros do ano
  const numeracao = lerLeitura_('Numeracao');
  const auditar = function (tipo, todos, doPeriodo) {
    const vistos = {}, out = [];
    doPeriodo.forEach(function (r) {
      const g = grupoSeq_(tipo, r), k = g + '|' + r.ano;
      if (!r.unidade && !r.barreira || !r.ano || vistos[k]) return;
      vistos[k] = true;
      const a = auditarRegs_(tipo, g, r.ano, todos, numeracao);
      a.grupo = g; a.ano = r.ano; a.lacunasTotal = a.lacunas.length; a.lacunas = a.lacunas.slice(0, PAINEL_MAX_LACUNAS);
      out.push(a);
    });
    return out;
  };

  return {
    ok: true,
    agora: Date.now(),
    admin: admin,
    periodo: p,
    turnos: turnos,
    veiculos: veiculos,
    tfsAndamento: tfsAndamento,
    tfs: tfs,
    levantamentos: levantamentos,
    colheitas: colheitas,
    historicoPce: historicoPce,
    termosPce: termosPce,
    cadastrosPce: cadastrosPce,
    barreiras: lerLeitura_('Barreiras').filter(function (b) { return b.id; })
      .map(function (b) { return { id: b.id, nome: b.nome, sufixo: b.sufixo, local: b.local, ativo: b.ativo === 1, bva: bvaDoCadastro_(b) }; }),
    auditoria: { tf: auditar('TF', todosTFs, tfsPer), pce: auditar('PCE', todasColheitas, colPer),
                 termosPce: auditar('TPCE', todosTermosPce, termosPcePer), cadastrosPce: auditar('CPCE', todosCadastrosPce, todosCadastrosPce.filter(noPeriodo)) }
  };
}

/* ---------- Convênios (aba "Convênios" do painel; só administrador) ----------
 * Convênio SUASA nº 991272/2025 – MAPA/ADAF: metas físicas por etapa, execução financeira e textos do relatório mensal.
 * Configuração (etapas, metas, sub-metas, bens, plano de aplicação, assinaturas e regras de apuração): aba "Convenios", uma linha por
 * convênio com o JSON (cabe numa célula, aparece no backup diário da planilha e qualquer um vê/audita; a propriedade do script tem
 * limite de 9 KB por valor). Sem linha = semente embutida (convSemente_), gravada na primeira vez que o gerente salva.
 * Apuração automática (painelConvApuracao): só contagens por mês e por município/BVA — nunca nomes, CPF/CNPJ, placas ou coordenadas.
 *   1.4  municípios distintos com levantamento PCE de monilíase OU Termo de Fiscalização do PCE de monilíase; por município, propriedades
 *        distintas (código da propriedade; sem código, CPF/CNPJ + nome da propriedade normalizados) e nº de registros;
 *   1.9  turnos de barreira volante (posto "Móvel") nos municípios configurados (unidade/local do turno), com veículos e TFs desses turnos;
 *   1.10 veículos abordados nas BVAs fixas configuradas (local do turno = nome da BVA), com TFs, apreensões e rechaços.
 * Etapas manuais e ajustes (+/−, justificativa obrigatória) ficam em ConvLancamentos; o financeiro em ConvFinanceiro. */
const CONV_ID_PADRAO = '991272-2025';
const CONV_APURACOES = ['bens', 'manual', 'pce', 'volante', 'bva'];
const CONV_AUTOMATICAS = ['pce', 'volante', 'bva'];
const CONV_TIPOS = ['execucao', 'ajuste', 'bem'];
const CONV_SITUACOES_BEM = ['previsto', 'em_aquisicao', 'adquirido', 'entregue'];
const CONV_FONTES = ['concedente', 'contrapartida'];
const CONV_CAMPOS_ETAPA_TXT = ['evidencias', 'justificativa', 'fator', 'providencia', 'situacao'];
const CONV_CAMPOS_GERAIS = ['fatores', 'providencias', 'analise', 'conclusao'];
const CONV_RE_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const CONV_RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Item do plano de aplicação: [id, nome, natureza, unidade, quantidade, valor unitário, total]. */
function convItem_(a) { return { id: a[0], nome: a[1], natureza: a[2], unidade: a[3], quantidade: a[4], valorUnitario: a[5], total: a[6] }; }

/** Semente do Convênio SUASA nº 991272/2025 (números do Plano de Trabalho; textos do relatório parcial 1; sem dados pessoais). */
function convSemente_() {
  const it = function (lst) { return lst.map(convItem_); };
  return {
    id: CONV_ID_PADRAO, numero: '991272/2025', programa: 'SUASA',
    nome: 'Convênio SUASA nº 991272/2025 – MAPA/ADAF',
    concedente: 'Ministério da Agricultura e Pecuária – MAPA (SDA/DSV, SFA-AM)',
    convenente: 'Agência de Defesa Agropecuária e Florestal do Estado do Amazonas – ADAF',
    titulo: 'RELATÓRIO CIRCUNSTANCIAL TÉCNICO DE EXECUÇÃO FÍSICA DAS METAS',
    objeto: 'Fortalecimento das ações de Defesa Sanitária Vegetal no Estado do Amazonas',
    objetoPlano: 'Atender, extraordinariamente, ações emergenciais do Governo Federal e dos Órgãos Executores de Sanidade Agropecuária, de prevenção e combate às emergências agropecuárias em curso e relacionadas às pragas Moniliophthora roreri, Bactrocera carambolae e Rhizoctonia theobromae.',
    meta: 'Meta 1: Manter e Fortalecer as Ações de Sanidade Vegetal',
    vigencia: { inicio: '2025-12-01', fim: '2027-04-01' }, inicioExecucao: '2026-03-01', local: 'Manaus/AM',
    valores: { repasse: 2200000, repasseCusteio: 1200000, repasseInvestimento: 1000000, contrapartida: 68042, global: 2268042 },
    assinaturas: [{ nome: 'FRANCISCO DANIEL DE OLIVEIRA SENA', cargo: 'Diretor-Presidente da ADAF' },
                  { nome: 'STEFANO SAMUEL BERNARDO DA COSTA', cargo: 'Chefe do DDAF' },
                  { nome: 'SIVANDRO CAMPOS DE FREITAS', cargo: 'Gerente de Defesa Vegetal/ADAF' }],
    etapas: [
      { id: '1.1', nome: 'Estruturação das Unidades Locais para realização das Ações dos Programas Nacionais de Sanidade Vegetal', nomeCurto: 'Estruturação das unidades locais',
        apuracao: 'bens', unidade: 'bens', meta: 10, valor: 1068042, contrapartida: 68042,
        bens: [{ id: 'pickup-urucurituba', nome: 'Pick-up 4x4', local: 'Urucurituba' },
               { id: 'embarcacao-urucurituba', nome: 'Embarcação 150 HP', local: 'Urucurituba' }, { id: 'embarcacao-nhamunda', nome: 'Embarcação 150 HP', local: 'Nhamundá' },
               { id: 'embarcacao-tabatinga', nome: 'Embarcação 150 HP', local: 'Tabatinga' },
               { id: 'quadriciclo-benjamin', nome: 'Quadriciclo', local: 'Benjamin Constant' }, { id: 'quadriciclo-nhamunda', nome: 'Quadriciclo', local: 'Nhamundá' },
               { id: 'quadriciclo-spo', nome: 'Quadriciclo', local: 'São Paulo de Olivença' },
               { id: 'carreta-urucurituba', nome: 'Carreta de reboque', local: 'Urucurituba' }, { id: 'carreta-nhamunda', nome: 'Carreta de reboque', local: 'Nhamundá' },
               { id: 'carreta-tabatinga', nome: 'Carreta de reboque', local: 'Tabatinga' }],
        itens: it([['1.1.1', 'Embarcação fluvial (15 pessoas) com motor de popa 150 HP', '44.90.52', 'Unid.', 3, 180000, 540000],
                   ['1.1.2', 'Carreta de reboque', '44.90.52', 'Unid.', 3, 12000, 36000],
                   ['1.1.3', 'Quadriciclo', '44.90.52', 'Unid.', 3, 63333.33, 190000],
                   ['1.1.4', 'Veículo tipo caminhonete (pick-up) 4x4', '44.90.52', 'Unid.', 1, 302042, 302042]]) },
      { id: '1.3', nome: 'Vigilância em Áreas Consideradas de Maior Risco Fitossanitário', nomeCurto: 'Vigilância em áreas de risco',
        apuracao: 'manual', modo: 'media', unidade: 'áreas de vigilância', meta: 7, valor: 35788,
        submetas: [{ id: 'nhamunda', nome: 'Monitoramento de armadilhas – Nhamundá', municipio: 'Nhamundá', meta: 24, unidade: 'monitoramentos', contagem: 'soma' },
                   { id: 'parintins', nome: 'Monitoramento de armadilhas – Parintins', municipio: 'Parintins', meta: 24, unidade: 'monitoramentos', contagem: 'soma' },
                   { id: 'itacoatiara', nome: 'Monitoramento de armadilhas – Itacoatiara', municipio: 'Itacoatiara', meta: 24, unidade: 'monitoramentos', contagem: 'soma' },
                   { id: 'moniliase-risco', nome: 'Vigilância de monilíase em municípios de alto risco', municipio: '', meta: 5, unidade: 'municípios', contagem: 'municipios',
                     municipios: ['Coari', 'Manicoré', 'Novo Aripuanã', 'Borba', 'Nova Olinda do Norte'] }],
        itens: it([['1.3.1', 'Gasolina', '33.90.30', 'Litro', 2260, 12, 27120], ['1.3.2', 'Passagem Aérea', '33.90.33', 'Unid.', 1, 2500, 2500],
                   ['1.3.3', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 4, 132, 528], ['1.3.4', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 27, 120, 3240],
                   ['1.3.5', 'Passagem Fluvial', '33.90.30', 'Unid.', 8, 300, 2400]]) },
      { id: '1.4', nome: 'Levantamentos Fitossanitários de Detecção/Delimitação e Verificação', nomeCurto: 'Levantamentos de monilíase',
        apuracao: 'pce', unidade: 'municípios levantados', meta: 52, valor: 141020, pragas: ['Monilíase', 'Moniliophthora roreri'],
        itens: it([['1.4.1', 'Gasolina', '33.90.30', 'Litro', 5600, 12, 67200], ['1.4.2', 'Passagem Aérea', '33.90.33', 'Unid.', 11, 2500, 27500],
                   ['1.4.3', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 189, 120, 22680], ['1.4.4', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 70, 132, 9240],
                   ['1.4.5', 'Passagem Fluvial', '33.90.30', 'Unid.', 48, 300, 14400]]) },
      { id: '1.5', nome: 'Ações de Controle e Erradicação', nomeCurto: 'Controle e supressão da monilíase',
        apuracao: 'manual', modo: 'soma', unidade: 'ações', meta: 72, valor: 479160,
        submetas: ['Tabatinga', 'Benjamin Constant', 'São Paulo de Olivença', 'Atalaia do Norte', 'Urucurituba'].map(function (m) {
          return { id: normPub_(m).replace(/ /g, '-'), nome: m, municipio: m, meta: null, unidade: 'ações', contagem: 'soma' }; }),
        itens: it([['1.5.1', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 30, 132, 3960], ['1.5.2', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 1080, 120, 129600],
                   ['1.5.3', 'Gasolina', '33.90.30', 'Litro', 7200, 12, 86400], ['1.5.4', 'Diárias Terceiros', '33.90.36', 'Unid.', 2160, 120, 259200]]) },
      { id: '1.9', nome: 'Fiscalização Móvel do Trânsito de Vegetais', nomeCurto: 'Fiscalização móvel (Tabatinga)',
        apuracao: 'volante', unidade: 'ações de fiscalização', meta: 24, valor: 109320, municipios: ['Tabatinga'],
        itens: it([['1.9.1', 'Gasolina', '33.90.30', 'Litro', 480, 12, 5760], ['1.9.2', 'Passagem Aérea', '33.90.33', 'Unid.', 24, 2500, 60000],
                   ['1.9.3', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 30, 132, 3960], ['1.9.4', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 330, 120, 39600]]) },
      { id: '1.10', nome: 'Fiscalização do Trânsito Interestadual de Vegetais em Postos Fixos', nomeCurto: 'Fiscalização em postos fixos',
        apuracao: 'bva', unidade: 'veículos fiscalizados', meta: 18000, valor: 409200, bvas: ['BVA - JUNDIÁ', 'BVA - CEASA'],
        obs: 'O Plano de Trabalho prevê 1.800 diárias nesta etapa (financeiro); a meta física é de 18.000 veículos fiscalizados.',
        itens: it([['1.10.1', 'Gasolina', '33.90.30', 'Litro', 1000, 12, 12000], ['1.10.2', 'Diesel', '33.90.30', 'Litro', 3600, 10, 36000],
                   ['1.10.3', 'Diárias Servidor Nível Superior Fora do Estado', '33.90.14', 'Unid.', 260, 252, 65520], ['1.10.4', 'Diárias Servidor Nível Médio Fora do Estado', '33.90.14', 'Unid.', 760, 210, 159600],
                   ['1.10.5', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 1134, 120, 136080]]) },
      { id: '1.14', nome: 'Supervisão das Ações de Fitossanidade nas Unidades Regionais e Locais', nomeCurto: 'Supervisão das unidades',
        apuracao: 'manual', modo: 'soma', unidade: 'supervisões', meta: 6, valor: 25512,
        submetas: [{ id: 'jundia', nome: 'BVA do Jundiá (Presidente Figueiredo)', municipio: 'Presidente Figueiredo', meta: 3, unidade: 'supervisões', contagem: 'soma' },
                   { id: 'tabatinga', nome: 'Tabatinga', municipio: 'Tabatinga', meta: 3, unidade: 'supervisões', contagem: 'soma' }],
        itens: it([['1.14.1', 'Diesel', '33.90.30', 'Litro', 270, 10, 2700], ['1.14.2', 'Passagem Aérea', '33.90.33', 'Unid.', 6, 2500, 15000],
                   ['1.14.3', 'Diárias Servidor Nível Médio no Estado', '33.90.14', 'Unid.', 15, 120, 1800], ['1.14.4', 'Diárias Servidor Nível Superior no Estado', '33.90.14', 'Unid.', 15, 132, 1980],
                   ['1.14.5', 'Diárias Servidor Nível Superior Fora do Estado', '33.90.14', 'Unid.', 6, 252, 1512], ['1.14.6', 'Diárias Servidor Nível Médio Fora do Estado', '33.90.14', 'Unid.', 12, 210, 2520]]) }
    ],
    versao: 0, atualizadoEm: 0, atualizadoPor: ''
  };
}

/** Convênios configurados (aba Convenios; sem linha válida = semente). */
function convListar_() {
  const lst = [];
  lerLeitura_('Convenios').forEach(function (r) {
    const c = lerJSONSeguro_(r.config, null);
    if (r.id && c && typeof c === 'object' && Array.isArray(c.etapas)) { c.id = r.id; lst.push(c); }
  });
  if (!lst.some(function (c) { return c.id === CONV_ID_PADRAO; })) lst.unshift(convSemente_());
  return lst;
}
function convDe_(id) {
  id = String(id || CONV_ID_PADRAO);
  const c = convListar_().filter(function (x) { return x.id === id; })[0];
  if (!c) throw new Error('Convênio não encontrado: ' + id + '.');
  return c;
}
function convEtapa_(cfg, id) {
  const e = cfg.etapas.filter(function (x) { return x.id === String(id || ''); })[0];
  if (!e) throw new Error('Etapa inexistente no convênio: ' + id + '.');
  return e;
}
/** Texto livre: espaços aparados, limite de tamanho e sem CPF (os lançamentos nunca pedem dados pessoais). */
function convTexto_(v, max, rotulo) {
  const s = String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (s.length > max) throw new Error(rotulo + ': no máximo ' + max + ' caracteres.');
  if (CONV_RE_CPF.test(s)) throw new Error(rotulo + ': não informe CPF (LGPD).');
  return /^[=+\-@]/.test(s) ? "'" + s : s;              // texto digitado não vira fórmula na planilha
}
function convNumero_(v, rotulo) {
  const n = typeof v === 'number' ? v : numOuNulo_(v);
  if (n === null || !isFinite(n)) throw new Error(rotulo + ' deve ser um número.');
  return n;
}
function convDataNaVigencia_(cfg, d) {
  if (!diaValido_(d)) throw new Error('Data inválida: use aaaa-mm-dd.');
  if (d < cfg.vigencia.inicio || d > cfg.vigencia.fim) throw new Error('Data fora da vigência do convênio (' + diaBR_(cfg.vigencia.inicio) + ' a ' + diaBR_(cfg.vigencia.fim) + ').');
  return d;
}
/** Grava (insere ou substitui pela coluna id) uma linha numa aba do convênio. */
function convGravar_(nome, o) {
  const t = lerTudo_(nome), linha = t.cols.map(function (c) { const v = o[c]; return v === null || v === undefined ? '' : v; });
  for (let i = 0; i < t.valores.length; i++) {
    if (String(t.valores[i][0]) === String(o.id)) { t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([linha]); return; }
  }
  t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues([linha]);
}
function convLinha_(nome, id) {
  const t = lerTudo_(nome);
  for (let i = 0; i < t.valores.length; i++) if (String(t.valores[i][0]) === String(id)) return paraObjeto_(t.cols, t.valores[i]);
  return null;
}
function convLancOut_(r) {
  return { id: r.id, convenio: r.convenio, etapa: r.etapa, submeta: r.submeta, data: r.data, municipio: r.municipio, quantidade: numOuNulo_(r.quantidade) || 0,
           descricao: r.descricao, tipo: r.tipo, situacao: r.situacao, documento: r.documento, armadilhas: numOuNulo_(r.armadilhas),
           propriedades: numOuNulo_(r.propriedades), usuario: r.usuario, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm };
}
function convFinOut_(r) {
  return { id: r.id, convenio: r.convenio, etapa: r.etapa, item: r.item, natureza: r.natureza, data: r.data, quantidade: numOuNulo_(r.quantidade),
           valor: numOuNulo_(r.valor) || 0, documento: r.documento, descricao: r.descricao, fonte: r.fonte, usuario: r.usuario, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm,
           chave: r.chave, origem: r.origem || 'manual', arquivo: r.arquivo, importadoEm: r.importadoEm || 0, tipoDiaria: r.tipoDiaria || '' };
}
/** Para o Portal do Administrativo: o mesmo e o servidor que recebeu (id e nome — o nome NUNCA vai ao painel nem aos relatórios). */
function convFinOutAdm_(r) {
  const o = convFinOut_(r);
  o.servidorId = r.servidorId || ''; o.servidorNome = r.servidorNome || ''; o.admId = r.admId || '';
  return o;
}

/** Painel → aba Convênios: configurações, lançamentos físicos, financeiro e textos dos relatórios (só administrador). */
function painelConvenios(token) {
  const admin = adminDoToken_(token);
  const vivo = function (r) { return r.id && r.excluido !== 1; };
  return { ok: true, admin: admin, hoje: hojeManaus_(), convenios: convListar_(), semente: convSemente_(),
           lancamentos: lerLeitura_('ConvLancamentos').filter(vivo).map(convLancOut_),
           financeiro: lerLeitura_('ConvFinanceiro').filter(vivo).map(function (r) { const o = convFinOut_(r); o.servidorNome = r.servidorNome || ''; return o; }),   // painel (só administrador) mostra o servidor; relatórios não
           relatorios: lerLeitura_('ConvRelatorios').filter(function (r) { return r.id; }).map(function (r) {
             return { id: r.id, convenio: r.convenio, mes: r.mes, numero: r.numero, textos: lerJSONSeguro_(r.textos, {}), usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }) };
}

/** Salva a configuração editável (textos, datas, assinaturas, metas/sub-metas, BVAs, municípios, pragas, previsto dos itens). */
function painelConvSalvar(token, convenio, config) {
  const admin = adminDoToken_(token);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuração inválida.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const atual = convDe_(convenio), c = JSON.parse(JSON.stringify(atual));
    const txt = function (k, max, obrig) {
      if (!(k in config)) return;
      const v = convTexto_(config[k], max, k);
      if (!v && obrig) throw new Error('Preencha o campo ' + k + '.');
      c[k] = v;
    };
    txt('titulo', 200, true); txt('objeto', 600, true); txt('meta', 300, true); txt('local', 80, true); txt('nome', 200, true);
    if (config.vigencia) {
      const vi = String(config.vigencia.inicio || ''), vf = String(config.vigencia.fim || '');
      if (!diaValido_(vi) || !diaValido_(vf) || vi >= vf) throw new Error('Vigência inválida.');
      c.vigencia = { inicio: vi, fim: vf };
    }
    if ('inicioExecucao' in config) c.inicioExecucao = String(config.inicioExecucao || '');
    if (!diaValido_(c.inicioExecucao) || c.inicioExecucao < c.vigencia.inicio || c.inicioExecucao >= c.vigencia.fim) throw new Error('Início da execução deve estar dentro da vigência.');
    if ('assinaturas' in config) {
      if (!Array.isArray(config.assinaturas) || config.assinaturas.length > 3) throw new Error('Assinaturas: até 3 linhas.');
      c.assinaturas = config.assinaturas.map(function (a, i) {
        return { nome: convTexto_(a && a.nome, 100, 'Assinatura ' + (i + 1)), cargo: convTexto_(a && a.cargo, 120, 'Cargo ' + (i + 1)) };
      }).filter(function (a) { return a.nome || a.cargo; });
    }
    if ('etapas' in config) {
      if (!Array.isArray(config.etapas)) throw new Error('Etapas inválidas.');
      config.etapas.forEach(function (o) {
        if (!o || typeof o !== 'object') throw new Error('Etapa inválida.');
        const e = convEtapa_(c, o.id);
        if ('meta' in o) { const m = convNumero_(o.meta, 'Meta da etapa ' + e.id); if (!(m > 0) || m > 1e7) throw new Error('Meta da etapa ' + e.id + ' deve ser maior que zero.'); e.meta = m; }
        if ('nome' in o) { const n = convTexto_(o.nome, 200, 'Nome da etapa ' + e.id); if (n) e.nome = n; }
        if ('nomeCurto' in o) { const n = convTexto_(o.nomeCurto, 80, 'Nome curto da etapa ' + e.id); if (n) e.nomeCurto = n; }
        if ('unidade' in o) { const n = convTexto_(o.unidade, 60, 'Unidade da etapa ' + e.id); if (n) e.unidade = n; }
        const listaTxt = function (k, rot) {
          if (!(k in o)) return;
          const l = (Array.isArray(o[k]) ? o[k] : String(o[k] || '').split(/[\n;]/)).map(function (x) { return convTexto_(x, 80, rot); }).filter(Boolean);
          if (!l.length || l.length > 20) throw new Error(rot + ' (etapa ' + e.id + '): de 1 a 20 itens.');
          e[k] = l;
        };
        if (e.apuracao === 'bva') listaTxt('bvas', 'BVAs');
        if (e.apuracao === 'volante') listaTxt('municipios', 'Municípios');
        if (e.apuracao === 'pce') listaTxt('pragas', 'Nomes da praga');
        if ('submetas' in o && e.apuracao === 'manual') {
          if (!Array.isArray(o.submetas) || o.submetas.length > 20) throw new Error('Sub-metas da etapa ' + e.id + ': até 20.');
          const vistos = {};
          e.submetas = o.submetas.map(function (s, i) {
            const nome = convTexto_(s && s.nome, 120, 'Sub-meta');
            if (!nome) throw new Error('Sub-meta ' + (i + 1) + ' da etapa ' + e.id + ' sem nome.');
            let id = String((s && s.id) || '').trim() || normPub_(nome).replace(/ /g, '-').slice(0, 40);
            if (!/^[a-z0-9-]{1,40}$/.test(id) || vistos[id]) id = id.replace(/[^a-z0-9-]/g, '').slice(0, 34) + '-' + (i + 1);
            vistos[id] = true;
            const meta = s.meta === '' || s.meta === null || s.meta === undefined ? null : convNumero_(s.meta, 'Meta da sub-meta ' + nome);
            if (meta !== null && meta < 0) throw new Error('Meta da sub-meta ' + nome + ' negativa.');
            const contagem = s.contagem === 'municipios' ? 'municipios' : 'soma';
            const o2 = { id: id, nome: nome, municipio: convTexto_(s.municipio, 80, 'Município'), meta: meta, unidade: convTexto_(s.unidade, 40, 'Unidade') || e.unidade, contagem: contagem };
            if (contagem === 'municipios') o2.municipios = (Array.isArray(s.municipios) ? s.municipios : String(s.municipios || '').split(/[\n;,]/)).map(function (x) { return convTexto_(x, 80, 'Município'); }).filter(Boolean).slice(0, 60);
            return o2;
          });
        }
        if ('itens' in o) {
          if (!Array.isArray(o.itens)) throw new Error('Itens inválidos.');
          o.itens.forEach(function (x) {
            const item = (e.itens || []).filter(function (y) { return y.id === String(x && x.id); })[0];
            if (!item) throw new Error('Item inexistente: ' + (x && x.id) + '.');
            if ('quantidade' in x) { const q = convNumero_(x.quantidade, 'Quantidade do item ' + item.id); if (q < 0) throw new Error('Quantidade negativa.'); item.quantidade = q; }
            if ('valorUnitario' in x) { const v = convNumero_(x.valorUnitario, 'Valor unitário do item ' + item.id); if (v < 0) throw new Error('Valor negativo.'); item.valorUnitario = v; }
            if ('total' in x && x.total !== '' && x.total !== null) { const t = convNumero_(x.total, 'Total do item ' + item.id); if (t < 0) throw new Error('Valor negativo.'); item.total = Math.round(t * 100) / 100; }
            else if ('quantidade' in x || 'valorUnitario' in x) item.total = Math.round(item.quantidade * item.valorUnitario * 100) / 100;
          });
          e.valor = Math.round(e.itens.reduce(function (s, y) { return s + (Number(y.total) || 0); }, 0) * 100) / 100;
        }
      });
    }
    c.versao = (Number(atual.versao) || 0) + 1; c.atualizadoEm = Date.now(); c.atualizadoPor = admin;
    const json = JSON.stringify(c);
    if (json.length > 45000) throw new Error('Configuração grande demais.');
    convGravar_('Convenios', { id: c.id, config: json, atualizadoEm: c.atualizadoEm, atualizadoPor: admin });
    return { ok: true, config: c };
  } finally { lock.releaseLock(); }
}

/** Painel: as gravações de dados do convênio passaram para o Portal do Administrativo (o painel só mostra). Fiscal continua com "Acesso restrito". */
function painelConvLancar(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }
function painelConvFinLancar(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }
function painelConvFinImportar(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }
function painelConvExcluir(token) { adminDoToken_(token); throw new Error(MSG_PORTAL); }

/**
 * Lançamento físico (novo ou edição pelo id): execucao (etapa manual), ajuste (etapa automática, justificativa obrigatória) ou bem (1.1).
 * autor = {nome, admId} (Portal do Administrativo). Devolve também {antes} para o histórico.
 */
function convLancar_(autor, l) {
  if (!l || typeof l !== 'object') throw new Error('Lançamento inválido.');
  const cfg = convDe_(l.convenio), e = convEtapa_(cfg, l.etapa);
  const tipo = String(l.tipo || (e.apuracao === 'bens' ? 'bem' : CONV_AUTOMATICAS.indexOf(e.apuracao) >= 0 ? 'ajuste' : 'execucao'));
  if (CONV_TIPOS.indexOf(tipo) < 0) throw new Error('Tipo de lançamento inválido.');
  if (tipo === 'execucao' && e.apuracao !== 'manual') throw new Error('A etapa ' + e.id + ' é apurada automaticamente: use um ajuste (+/−) com justificativa.');
  if (tipo === 'ajuste' && CONV_AUTOMATICAS.indexOf(e.apuracao) < 0) throw new Error('Ajuste só nas etapas apuradas automaticamente.');
  if (tipo === 'bem' && e.apuracao !== 'bens') throw new Error('A etapa ' + e.id + ' não tem bens.');
  const o = { convenio: cfg.id, etapa: e.id, tipo: tipo, data: convDataNaVigencia_(cfg, String(l.data || '')),
              municipio: convTexto_(l.municipio, 80, 'Município'), descricao: convTexto_(l.descricao, 2000, 'Descrição'),
              documento: convTexto_(l.documento, 120, 'Documento'), submeta: String(l.submeta || '').trim(), situacao: '' };
  if (tipo === 'bem') {
    if (!(e.bens || []).some(function (b) { return b.id === o.submeta; })) throw new Error('Bem inexistente na etapa ' + e.id + '.');
    o.situacao = String(l.situacao || '');
    if (CONV_SITUACOES_BEM.indexOf(o.situacao) < 0) throw new Error('Situação do bem inválida.');
    o.quantidade = 1;
    var bemValor = l.valor === '' || l.valor === null || l.valor === undefined ? null : Math.round(convNumero_(l.valor, 'Valor de aquisição') * 100) / 100;
    if (bemValor !== null && !(bemValor > 0 && bemValor <= 1e8)) throw new Error('Valor de aquisição inválido.');
    var bemQtd = l.quantidadeAquisicao === '' || l.quantidadeAquisicao === null || l.quantidadeAquisicao === undefined ? null : convNumero_(l.quantidadeAquisicao, 'Quantidade adquirida');
    if (bemQtd !== null && !(bemQtd > 0 && bemQtd <= 1e4)) throw new Error('Quantidade adquirida inválida.');
    var bemFonte = String(l.fonte || 'concedente');
    if (CONV_FONTES.indexOf(bemFonte) < 0) throw new Error('Fonte inválida (concedente ou contrapartida).');
  } else {
    const q = convNumero_(l.quantidade, 'Quantidade');
    if (Math.abs(q) > 1e6) throw new Error('Quantidade grande demais.');
    if (tipo === 'execucao' && !(q > 0)) throw new Error('Quantidade deve ser maior que zero.');
    if (tipo === 'ajuste' && q === 0) throw new Error('Ajuste com quantidade zero.');
    if (tipo === 'ajuste' && o.descricao.length < 5) throw new Error('Ajuste exige justificativa (descrição).');
    o.quantidade = q;
    const subs = e.submetas || [];
    if (tipo === 'execucao' && subs.length && !subs.some(function (s) { return s.id === o.submeta; })) throw new Error('Escolha a sub-meta/município da etapa ' + e.id + '.');
    if (tipo === 'execucao' && !subs.length) o.submeta = '';
    const sub = subs.filter(function (s) { return s.id === o.submeta; })[0];
    if (sub && !o.municipio) o.municipio = sub.municipio || '';
    if (sub && sub.contagem === 'municipios' && !o.municipio) throw new Error('Informe o município da sub-meta "' + sub.nome + '".');
    ['armadilhas', 'propriedades'].forEach(function (k) {
      const v = l[k] === '' || l[k] === null || l[k] === undefined ? null : convNumero_(l[k], k);
      if (v !== null && (v < 0 || v > 1e6)) throw new Error(k + ' inválido.');
      o[k] = v === null ? '' : v;
    });
  }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const agora = Date.now();
    let id = String(l.id || ''), ant = null;
    if (id) {
      ant = convLinha_('ConvLancamentos', id);
      if (!ant || ant.excluido === 1 || ant.convenio !== cfg.id) throw new Error('Lançamento não encontrado.');
      o.criadoEm = ant.criadoEm;
    } else { id = Utilities.getUuid(); o.criadoEm = agora; }
    o.id = id; o.usuario = autor.nome; o.admId = autor.admId || ''; o.atualizadoEm = agora; o.excluido = 0;
    // bem adquirido/entregue: o valor de aquisição vira (ou atualiza) o desembolso do item do bem no Financeiro (chave bem|<convênio>|<bem>)
    let fin = null;
    if (tipo === 'bem' && (o.situacao === 'adquirido' || o.situacao === 'entregue')) {
      fin = convBemFinanceiro_(autor, cfg, e, o, bemValor, bemFonte, agora, bemQtd);
      if (!fin) throw new Error('Informe o valor de aquisição do bem (entra no financeiro da etapa ' + e.id + ').');
    }
    convGravar_('ConvLancamentos', o);
    return { ok: true, lancamento: convLancOut_(paraObjeto_(TABELAS.ConvLancamentos, TABELAS.ConvLancamentos.map(function (c) { return o[c]; }))), antes: ant,
             financeiro: fin && fin.lancamento, finAntes: fin && fin.antes };
  } finally { lock.releaseLock(); }
}

/** Item do plano de aplicação de um bem da 1.1: b.item, ou o item cujo nome traz a primeira palavra do bem (pick-up, embarcação, quadriciclo, carreta). */
function convItemDoBem_(e, b) {
  const itens = e.itens || [];
  if (b.item) { const x = itens.filter(function (i) { return i.id === b.item; })[0]; if (x) return x; }
  const p = normPub_(b.nome).split(' ')[0];
  return itens.filter(function (i) { return normPub_(i.nome).split(' ').some(function (w) { return w === p || (p.length >= 4 && w.indexOf(p) === 0); }); })[0] || null;
}
const convChaveBem_ = function (cfg, bemId) { return 'bem|' + cfg.id + '|' + bemId; };
/**
 * Desembolso da aquisição de um bem (dentro do lock de convLancar_), com a quantidade adquirida (padrão 1). valor null = mantém o já lançado (ex.: "entregue" depois de "adquirido").
 * Devolve {lancamento, antes} ou null se não há valor nem lançamento anterior.
 */
function convBemFinanceiro_(autor, cfg, e, lanc, valor, fonte, agora, qtd) {
  const b = (e.bens || []).filter(function (x) { return x.id === lanc.submeta; })[0];
  const item = convItemDoBem_(e, b);
  if (!item) throw new Error('O bem "' + b.nome + '" não tem item no plano de aplicação da etapa ' + e.id + '.');
  const chave = convChaveBem_(cfg, b.id);
  const ant = lerLeitura_('ConvFinanceiro').filter(function (r) { return r.id && r.chave === chave; })[0] || null;
  const vivo = ant && ant.excluido !== 1;
  if (valor === null && !vivo) return null;
  const o = vivo ? JSON.parse(JSON.stringify(ant)) : { id: ant ? ant.id : Utilities.getUuid(), criadoEm: ant ? ant.criadoEm : agora };
  Object.assign(o, { convenio: cfg.id, etapa: e.id, item: item.id, natureza: item.natureza, chave: chave, origem: 'bem',
                     descricao: 'Aquisição: ' + b.nome + ' – ' + b.local, usuario: autor.nome, admId: autor.admId || '', atualizadoEm: agora, excluido: 0 });
  if (valor !== null) { o.valor = valor; o.fonte = fonte; }
  if (qtd !== null && qtd !== undefined) o.quantidade = qtd; else if (!vivo) o.quantidade = 1;
  if (!vivo || valor !== null) { o.data = lanc.data; if (lanc.documento) o.documento = lanc.documento; }
  if (!o.fonte) o.fonte = 'concedente';
  convGravar_('ConvFinanceiro', o);
  return { lancamento: convFinOutAdm_(paraObjeto_(TABELAS.ConvFinanceiro, TABELAS.ConvFinanceiro.map(function (c) { return o[c]; }))), antes: vivo ? ant : null };
}
const CONV_TIPOS_DIARIA = ['NM', 'NS', 'TERC'];
/**
 * Lançamento financeiro / desembolso (novo ou edição): etapa e item do plano de aplicação, data, quantidade (diárias), valor, documento
 * (memorando/empenho/NF/PCDP/OB), fonte, tipo da diária e servidor que recebeu (id da lista; o nome é resolvido aqui e gravado só na
 * planilha). autor = {nome, admId}. Devolve avisos (memorando repetido no item, diárias acima do previsto) e {antes} para o histórico.
 */
function convFinLancar_(autor, l) {
  if (!l || typeof l !== 'object') throw new Error('Lançamento inválido.');
  const cfg = convDe_(l.convenio), e = convEtapa_(cfg, l.etapa);
  const item = (e.itens || []).filter(function (x) { return x.id === String(l.item || ''); })[0];
  if (!item) throw new Error('Escolha o item do plano de aplicação da etapa ' + e.id + '.');
  const valor = Math.round(convNumero_(l.valor, 'Valor') * 100) / 100;
  if (valor === 0 || Math.abs(valor) > 1e8) throw new Error('Valor inválido.');
  const fonte = String(l.fonte || 'concedente');
  if (CONV_FONTES.indexOf(fonte) < 0) throw new Error('Fonte inválida (concedente ou contrapartida).');
  const qtd = l.quantidade === '' || l.quantidade === null || l.quantidade === undefined ? '' : convNumero_(l.quantidade, 'Quantidade');
  if (qtd !== '' && (qtd < 0 || qtd > 1e7)) throw new Error('Quantidade inválida.');
  const o = { convenio: cfg.id, etapa: e.id, item: item.id, natureza: item.natureza, data: convDataNaVigencia_(cfg, String(l.data || '')), quantidade: qtd,
              valor: valor, documento: convTexto_(l.documento, 120, 'Documento'), descricao: convTexto_(l.descricao, 1000, 'Descrição'), fonte: fonte, origem: 'manual' };
  if (valor < 0 && o.descricao.length < 5) throw new Error('Valor negativo (estorno) exige descrição.');
  o.tipoDiaria = String(l.tipoDiaria || '').toUpperCase();
  if (o.tipoDiaria && CONV_TIPOS_DIARIA.indexOf(o.tipoDiaria) < 0) throw new Error('Tipo de diária inválido (NM, NS ou terceiros).');
  // servidor da diária: nome digitado livremente (não precisa ser fiscal cadastrado); id estável pelo nome normalizado
  o.servidorNome = convTexto_(String(l.servidorNome || '').replace(/\s+/g, ' ').trim(), 120, 'Servidor'); o.servidorId = '';
  if (!o.servidorNome && l.servidorId) {                          // compatibilidade: id da lista antiga
    const srv = admServidores_().concat(admServidoresDiaria_()).filter(function (x) { return x.id === String(l.servidorId); })[0];
    if (srv) o.servidorNome = srv.nome;
  }
  if (o.servidorNome) o.servidorId = 'srv-' + hexSha_('srv:' + nomeChave_(o.servidorNome)).slice(0, 12);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const agora = Date.now();
    let id = String(l.id || ''), ant = null;
    if (id) {
      ant = convLinha_('ConvFinanceiro', id);
      if (!ant || ant.excluido === 1 || ant.convenio !== cfg.id) throw new Error('Lançamento não encontrado.');
      o.criadoEm = ant.criadoEm;
      // importado da planilha e editado à mão: mantém a chave (a próxima importação compara e, se a planilha diferir, atualiza)
      o.chave = ant.chave; o.origem = ant.origem || 'manual'; o.arquivo = ant.arquivo; o.importadoEm = ant.importadoEm;
    } else { id = Utilities.getUuid(); o.criadoEm = agora; }
    o.id = id; o.usuario = autor.nome; o.admId = autor.admId || ''; o.atualizadoEm = agora; o.excluido = 0;
    // avisos (não bloqueiam): memorando/documento repetido no mesmo item e diárias do item acima do previsto no plano
    const vivos = lerLeitura_('ConvFinanceiro').filter(function (r) { return r.id && r.id !== id && r.excluido !== 1 && r.convenio === cfg.id && r.item === item.id; });
    const docN = function (v) { return normPub_(v).replace(/^(memo|memorando|empenho|ne|nf|pcdp|ob)\s*(n|no|nº)?\s*/, '').replace(/^0+(?=\d)/, ''); };
    const avisos = [];
    if (o.documento && vivos.some(function (r) { return docN(r.documento) && docN(r.documento) === docN(o.documento); })) avisos.push('Documento/memorando ' + o.documento + ' já lançado neste item (possível duplicidade).');
    if (ConvNatDiarias_.indexOf(item.natureza) >= 0 && qtd !== '') {
      const usadas = vivos.reduce(function (t, r) { return t + (numOuNulo_(r.quantidade) || 0); }, 0) + Number(qtd);
      if (usadas > Number(item.quantidade || 0)) avisos.push('Diárias do item ' + item.id + ': ' + (Math.round(usadas * 10) / 10) + ' de ' + item.quantidade + ' previstas (acima do previsto).');
    }
    convGravar_('ConvFinanceiro', o);
    return { ok: true, lancamento: convFinOutAdm_(paraObjeto_(TABELAS.ConvFinanceiro, TABELAS.ConvFinanceiro.map(function (c) { return o[c]; }))), avisos: avisos, antes: ant };
  } finally { lock.releaseLock(); }
}
const ConvNatDiarias_ = ['33.90.14', '33.90.36'];

const CONV_IMP_MAX = 500;                              // lançamentos por chamada de painelConvFinImportar (o painel divide em lotes)
/**
 * Importação em lote da planilha de movimentação financeira (painel → Financeiro → "Importar planilha"; o .xlsx é lido no navegador).
 * req = {convenio, arquivo, itens: [{chave, item, etapa, data, valor, documento, quantidade, fonte, descricao}], excluir: [ids]}.
 * Idempotente pela chave (imp|<convênio>|<item>|<memo> ou imp|<convênio>|<item>|<data>|<valor>|<n>): chave já gravada e igual → nada;
 * diferente (valor/data/documento) → atualiza a mesma linha; nova → acrescenta. Linha excluída antes com a mesma chave volta a valer.
 * excluir = ids de lançamentos importados que sumiram da planilha e o gerente marcou para excluir (exclusão lógica).
 * Mesmas validações do lançamento manual (etapa/item do plano, data na vigência, valor, textos sem CPF). Nunca recebe nomes de servidores.
 */
function convFinImportar_(autor, req) {
  req = req || {};
  const cfg = convDe_(req.convenio);
  const itens = Array.isArray(req.itens) ? req.itens : [], excluir = Array.isArray(req.excluir) ? req.excluir.map(String) : [];
  if (!itens.length && !excluir.length) throw new Error('Nada a importar.');
  if (itens.length > CONV_IMP_MAX || excluir.length > CONV_IMP_MAX) throw new Error('No máximo ' + CONV_IMP_MAX + ' lançamentos por envio.');
  const arquivo = convTexto_(req.arquivo, 200, 'Arquivo');
  const pre = 'imp|' + cfg.id + '|', vistas = {};
  const novos = itens.map(function (l, i) {
    const rot = 'Linha ' + (i + 1);
    if (!l || typeof l !== 'object') throw new Error(rot + ': lançamento inválido.');
    const e = convEtapa_(cfg, l.etapa);
    const item = (e.itens || []).filter(function (x) { return x.id === String(l.item || ''); })[0];
    if (!item) throw new Error(rot + ': item ' + l.item + ' não existe na etapa ' + e.id + '.');
    const chave = String(l.chave || '');
    if (chave.indexOf(pre + item.id + '|') !== 0 || chave.length > 200) throw new Error(rot + ': chave de importação inválida.');
    if (vistas[chave]) throw new Error(rot + ': chave repetida no envio (' + chave + ').');
    vistas[chave] = 1;
    const valor = Math.round(convNumero_(l.valor, rot + ': valor') * 100) / 100;
    if (!(valor > 0) || valor > 1e8) throw new Error(rot + ': valor inválido.');
    const qtd = l.quantidade === '' || l.quantidade === null || l.quantidade === undefined ? '' : convNumero_(l.quantidade, rot + ': quantidade');
    if (qtd !== '' && (qtd < 0 || qtd > 1e7)) throw new Error(rot + ': quantidade inválida.');
    const fonte = String(l.fonte || 'concedente');
    if (CONV_FONTES.indexOf(fonte) < 0) throw new Error(rot + ': fonte inválida.');
    let data;
    try { data = convDataNaVigencia_(cfg, String(l.data || '')); } catch (err) { throw new Error(rot + ': ' + err.message); }
    const servidorNome = convTexto_(String(l.servidorNome || '').replace(/\s+/g, ' ').trim(), 120, rot + ': servidor');
    return { convenio: cfg.id, etapa: e.id, item: item.id, natureza: item.natureza, data: data, quantidade: qtd === '' ? '' : Math.round(qtd * 100) / 100, valor: valor,
             documento: convTexto_(l.documento, 120, rot + ': documento'), descricao: convTexto_(l.descricao, 200, rot + ': descrição'), fonte: fonte,
             chave: chave, origem: 'planilha', arquivo: arquivo,
             servidorNome: servidorNome, servidorId: servidorNome ? 'srv-' + hexSha_('srv:' + nomeChave_(servidorNome)).slice(0, 12) : '' };
  });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const t = lerTudo_('ConvFinanceiro'), cols = t.cols, ix = {}, iId = {};
    const ci = function (c) { return cols.indexOf(c); };
    t.valores.forEach(function (l, i) {
      const o = paraObjeto_(cols, l);
      if (o.chave && o.convenio === cfg.id) { if (!ix[o.chave] || ix[o.chave].o.excluido === 1) ix[o.chave] = { i: i, o: o }; }
      if (o.id) iId[o.id] = { i: i, o: o };
    });
    const agora = Date.now(), acrescentar = [], res = { novos: 0, atualizados: 0, iguais: 0, excluidos: 0, lancamentos: [] };
    const linhaDe = function (o) { return cols.map(function (c) { const v = o[c]; return v === null || v === undefined ? '' : v; }); };
    novos.forEach(function (n) {
      const a = ix[n.chave];
      if (a && a.o.excluido !== 1 && a.o.data === n.data && Number(a.o.valor) === n.valor && a.o.documento === n.documento && a.o.descricao === n.descricao &&
          a.o.item === n.item && String(a.o.quantidade) === String(n.quantidade) && a.o.fonte === n.fonte &&
          (!n.servidorNome || a.o.servidorNome === n.servidorNome)) { res.iguais++; return; }
      if (a && !n.servidorNome && a.o.servidorNome) { n.servidorNome = a.o.servidorNome; n.servidorId = a.o.servidorId; }   // sem nome no envio: mantém o já gravado
      const o = Object.assign({}, n, { usuario: autor.nome, admId: autor.admId || '', atualizadoEm: agora, importadoEm: agora, excluido: 0 });
      if (a) {
        o.id = a.o.id; o.criadoEm = a.o.criadoEm || agora;
        t.sh.getRange(a.i + 2, 1, 1, cols.length).setValues([linhaDe(o)]); res.atualizados++;
      } else { o.id = Utilities.getUuid(); o.criadoEm = agora; acrescentar.push(linhaDe(o)); res.novos++; }
      res.lancamentos.push(convFinOutAdm_(o));
    });
    if (acrescentar.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, acrescentar.length, cols.length).setValues(acrescentar);
    excluir.forEach(function (id) {
      const a = iId[id];
      if (!a || a.o.excluido === 1 || a.o.convenio !== cfg.id || a.o.origem !== 'planilha') throw new Error('Lançamento importado não encontrado: ' + id + '.');
      t.sh.getRange(a.i + 2, ci('excluido') + 1).setValue(1);
      t.sh.getRange(a.i + 2, ci('usuario') + 1).setValue(autor.nome);
      t.sh.getRange(a.i + 2, ci('admId') + 1).setValue(autor.admId || '');
      t.sh.getRange(a.i + 2, ci('atualizadoEm') + 1).setValue(agora);
      res.excluidos++;
    });
    res.ok = true; res.arquivo = arquivo;
    return res;
  } finally { lock.releaseLock(); }
}

/** Exclusão lógica (excluido = 1, com quem/quando) de um lançamento físico ou financeiro. */
function convExcluir_(autor, aba, id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const r = convLinha_(aba, String(id || ''));
    if (!r || r.excluido === 1) throw new Error('Lançamento não encontrado.');
    const antes = JSON.parse(JSON.stringify(r));
    r.excluido = 1; r.usuario = autor.nome; r.admId = autor.admId || ''; r.atualizadoEm = Date.now();
    convGravar_(aba, r);
    return { ok: true, id: r.id, antes: antes };
  } finally { lock.releaseLock(); }
}

/** Textos do relatório mensal (um por convênio e mês) e o número da parcial. */
function painelConvRelSalvar(token, req) {
  const admin = adminDoToken_(token);
  const cfg = convDe_(req.convenio), mes = String(req.mes || '');
  if (!CONV_RE_MES.test(mes) || mes < cfg.inicioExecucao.slice(0, 7) || mes > cfg.vigencia.fim.slice(0, 7)) throw new Error('Mês de referência inválido.');
  const numero = Math.round(convNumero_(req.numero, 'Número da parcial'));
  if (numero < 1 || numero > 99) throw new Error('Número da parcial inválido.');
  const t = req.textos && typeof req.textos === 'object' ? req.textos : {}, out = { etapas: {}, gerais: {} };
  Object.keys(t.etapas || {}).forEach(function (id) {
    convEtapa_(cfg, id);
    const x = t.etapas[id] || {}, y = {};
    Object.keys(x).forEach(function (k) { if (CONV_CAMPOS_ETAPA_TXT.indexOf(k) < 0) throw new Error('Campo desconhecido: ' + k + '.'); y[k] = convTexto_(x[k], 4000, 'Texto da etapa ' + id); });
    out.etapas[id] = y;
  });
  Object.keys(t.gerais || {}).forEach(function (k) {
    if (CONV_CAMPOS_GERAIS.indexOf(k) < 0) throw new Error('Campo desconhecido: ' + k + '.');
    out.gerais[k] = convTexto_(t.gerais[k], 8000, 'Texto ' + k);
  });
  const json = JSON.stringify(out);
  if (json.length > 45000) throw new Error('Textos grandes demais.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const o = { id: cfg.id + '|' + mes, convenio: cfg.id, mes: mes, numero: numero, textos: json, usuario: admin, atualizadoEm: Date.now() };
    convGravar_('ConvRelatorios', o);
    return { ok: true, relatorio: { id: o.id, convenio: o.convenio, mes: mes, numero: numero, textos: out, usuario: admin, atualizadoEm: o.atualizadoEm } };
  } finally { lock.releaseLock(); }
}

/**
 * Apuração automática das etapas 1.4, 1.9 e 1.10 no intervalo [de, ate] (o painel pede [início da execução, fim do mês escolhido],
 * assim o acumulado nunca depende do período carregado nas outras abas). Devolve só contagens (por mês AAAA-MM e por município/BVA).
 */
function painelConvApuracao(token, req) {
  adminDoToken_(token);
  const cfg = convDe_(req.convenio), de = String(req.de || cfg.inicioExecucao), ate = String(req.ate || hojeManaus_());
  if (!diaValido_(de) || !diaValido_(ate) || de > ate) throw new Error('Período inválido.');
  if (somarDias_(de, 1100) < ate) throw new Error('Período longo demais.');
  return convApurar_(cfg, de, ate);
}
function convApurar_(cfg, de, ate) {
  const noPer = function (d) { d = String(d || '').slice(0, 10); return d >= de && d <= ate; };
  const mesDe = function (d) { return String(d).slice(0, 7); };
  const out = { ok: true, convenio: cfg.id, de: de, ate: ate, apuradoEm: Date.now(), etapas: {} };
  const etapas = function (ap) { return cfg.etapas.filter(function (e) { return e.apuracao === ap; }); };
  const munNorm = function (s) { return normPub_(s).replace(/ (am|amazonas)$/, ''); };
  let turnos = null, veicPorTurno = null, tfs = null;
  // turnos, veículos e TFs do MESMO motor do VIGIFITO e do Relatório GDV (motorBarreira_): os números nunca divergem
  const carregarBarreira = function () {
    if (turnos) return;
    const M = motorBarreira_(de, ate);
    turnos = M.turnos; tfs = M.tfs; veicPorTurno = {};
    turnos.forEach(function (t) { veicPorTurno[t.id] = t.veiculos; });
  };

  // 1.4 — levantamentos/termos de monilíase: municípios distintos e propriedades por município
  etapas('pce').forEach(function (e) {
    const termos = (e.pragas || []).map(normPub_).filter(Boolean);
    const casa = function (nome) { const n = normPub_(nome); return !!n && termos.some(function (t) { return n.indexOf(t) >= 0; }); };
    const M = {}, MES = {};
    const marcar = function (municipio, data, prop) {
      const k = munNorm(municipio); if (!k) return;
      const mes = mesDe(data);
      const m = M[k] = M[k] || { municipio: String(municipio).trim(), props: {}, registros: 0, primeiro: data, meses: {} };
      m.props[prop] = true; m.registros++; if (data < m.primeiro) m.primeiro = data;
      const mm = m.meses[mes] = m.meses[mes] || { props: {}, registros: 0 }; mm.props[prop] = true; mm.registros++;
      const g = MES[mes] = MES[mes] || { muns: {}, registros: 0, props: {} }; g.muns[k] = true; g.registros++; g.props[k + '|' + prop] = true;
    };
    const chaveLev = function (r) {
      const cod = String(r.codigoPropriedade || '').trim(), doc = digitos_(r.doc), prop = String(r.propriedade || '').trim();
      return normPub_(cod || (doc && prop ? doc + '|' + prop : '')) || 'lev:' + r.id;
    };
    lerLeitura_('Levantamentos').forEach(function (r) {
      if (!r.id || r.excluido === 1 || !noPer(r.data)) return;
      if (!pragasLev_(r).some(function (g) { return casa(g.praga); })) return;
      marcar(r.municipio, r.data, chaveLev(r));
    });
    const cadProp = {};
    lerLeitura_('CadastrosPCE').forEach(function (c) { if (c.id) cadProp[c.id] = c; });
    lerLeitura_('TermosPCE').forEach(function (r) {
      if (!r.id || r.excluido === 1 || r.cancelado === 1 || !noPer(r.data)) return;
      const pr = lerJSONSeguro_(r.pragas, []);
      if (!((Array.isArray(pr) && pr.some(casa)) || (!(Array.isArray(pr) && pr.length) && r.programa === 'moniliase'))) return;
      const cad = cadProp[r.cadastroId], doc = digitos_(r.doc);
      const k = normPub_(r.propriedadeId || (cad && cad.propriedadeId) || (doc && cad && cad.propriedade ? doc + '|' + cad.propriedade : '')) || 'termo:' + r.id;
      marcar(r.municipio, r.data, k);
    });
    const meses = {};
    Object.keys(MES).forEach(function (mes) {
      const g = MES[mes];
      meses[mes] = { municipios: Object.keys(g.muns).map(function (k) { return M[k].municipio; }).sort(), registros: g.registros, propriedades: Object.keys(g.props).length };
    });
    out.etapas[e.id] = { tipo: 'pce', meses: meses, porMunicipio: Object.keys(M).map(function (k) {
      const m = M[k], ms = {};
      Object.keys(m.meses).forEach(function (mes) { ms[mes] = { propriedades: Object.keys(m.meses[mes].props).length, registros: m.meses[mes].registros }; });
      return { municipio: m.municipio, propriedades: Object.keys(m.props).length, registros: m.registros, primeiro: m.primeiro, meses: ms };
    }).sort(function (a, b) { return a.municipio.localeCompare(b.municipio); }) };
  });

  // 1.9 — barreira volante nos municípios configurados
  etapas('volante').forEach(function (e) {
    carregarBarreira();
    const muns = (e.municipios || []).map(munNorm).filter(Boolean);
    const volante = function (t) { return t.tipo === 'volante'; };
    const munDo = function (t) {
      const u = munNorm(t.unidade), l = normPub_(t.local);
      for (let i = 0; i < muns.length; i++) if (u === muns[i] || (' ' + l + ' ').indexOf(' ' + muns[i] + ' ') >= 0) return e.municipios[i];
      return null;
    };
    const sel = {}, M = {}, MES = {};
    const z = function () { return { turnos: 0, veiculos: 0, tfs: 0, apreensoes: 0, rechacos: 0 }; };
    turnos.forEach(function (t) {
      if (!volante(t)) return;
      const mun = munDo(t); if (!mun) return;
      sel[t.id] = { mun: mun, mes: mesDe(t.data) };
      const m = M[mun] = M[mun] || { municipio: mun, total: z(), meses: {} }, g = MES[mesDe(t.data)] = MES[mesDe(t.data)] || z();
      const mm = m.meses[mesDe(t.data)] = m.meses[mesDe(t.data)] || z();
      [m.total, mm, g].forEach(function (x) { x.turnos++; x.veiculos += veicPorTurno[t.id] || 0; });
    });
    tfs.forEach(function (tf) {
      const s = sel[tf.turnoId]; if (!s) return;
      [M[s.mun].total, M[s.mun].meses[s.mes], MES[s.mes]].forEach(function (x) {
        x.tfs++; if (tf.procedimento === 'apreensao') x.apreensoes++; if (tf.procedimento === 'rechaco') x.rechacos++; });
    });
    out.etapas[e.id] = { tipo: 'volante', meses: MES, porMunicipio: Object.keys(M).map(function (k) { return M[k]; }) };
  });

  // 1.10 — BVAs fixas configuradas: veículos, TFs, apreensões e rechaços
  etapas('bva').forEach(function (e) {
    carregarBarreira();
    // a mesma BVA tem nomes diferentes no app de campo ("BVA - CEASA") e no cadastro de barreiras do TF ("Barreira Porto da CEASA",
    // sufixo "BVA - CEASA"): qualquer id/nome/sufixo/local do cadastro conta para a BVA marcada que bater com um deles
    const bvas = [], vistos = {};
    (e.bvas || []).forEach(function (b) { const n = normPub_(b); if (n && !vistos[n]) { vistos[n] = 1; bvas.push(b); } });
    const alvo = {}; bvas.forEach(function (b) { alvo[normPub_(b)] = b; });
    const cad = {}; lerLeitura_('Barreiras').forEach(function (b) { if (b.id) cad[b.id] = b; });
    Object.keys(cad).forEach(function (k) {
      const b = cad[k], nomes = [b.id, b.nome, b.sufixo, b.local].map(normPub_).filter(Boolean);
      const canon = nomes.map(function (n) { return alvo[n]; }).filter(Boolean)[0];
      if (canon) nomes.forEach(function (n) { alvo[n] = canon; });
    });
    const unicas = []; bvas.forEach(function (b) { if (alvo[normPub_(b)] === b) unicas.push(b); });   // marcadas duas vezes (apelidos): uma só
    bvas.length = 0; unicas.forEach(function (b) { bvas.push(b); });
    const qual = function () {
      for (let a = 0; a < arguments.length; a++) { const n = normPub_(arguments[a]); if (n && alvo[n]) return alvo[n]; }
      return null;
    };
    const sel = {}, B = {}, MES = {};
    const z = function () { return { turnos: 0, veiculos: 0, tfs: 0, apreensoes: 0, rechacos: 0 }; };
    bvas.forEach(function (b) { B[b] = { bva: b, total: z(), meses: {} }; });
    turnos.forEach(function (t) {
      if (t.tipo === 'volante') return;
      const b = qual(t.local, t.unidade); if (!b) return;
      const mes = mesDe(t.data); sel[t.id] = { b: b, mes: mes };
      const mm = B[b].meses[mes] = B[b].meses[mes] || z(), g = MES[mes] = MES[mes] || z();
      [B[b].total, mm, g].forEach(function (x) { x.turnos++; x.veiculos += veicPorTurno[t.id] || 0; });
    });
    tfs.forEach(function (tf) {
      const s = sel[tf.turnoId], c = cad[tf.barreira] || {};
      const b = s ? s.b : (tf.turnoId ? null : qual(tf.local, c.nome, c.sufixo, c.local, tf.barreira)); if (!b) return;
      const mes = s ? s.mes : mesDe(tf.data);
      const mm = B[b].meses[mes] = B[b].meses[mes] || z(), g = MES[mes] = MES[mes] || z();
      [B[b].total, mm, g].forEach(function (x) { x.tfs++; if (tf.procedimento === 'apreensao') x.apreensoes++; if (tf.procedimento === 'rechaco') x.rechacos++; });
    });
    out.etapas[e.id] = { tipo: 'bva', meses: MES, porBva: bvas.map(function (b) { return B[b]; }) };
  });
  return out;
}

/* ---------- PCE: resultado laboratorial do Termo de Colheita ----------
 * Coluna "laboratorio" (JSON) da aba Colheitas, registrada depois da coleta no app (tela do termo → "Resultado do laboratório") ou
 * no painel (aba PCE → termos de colheita → painelPceLaudo). Não muda o número, o PDF nem os demais campos do termo. Cada registro
 * leva atualizadoEm/por: no sync, o resultado mais novo vale (um reenvio do termo pelo celular não apaga o lançado no painel). */
const LAB_RESULTADOS = ['aguardando', 'negativo', 'positivo', 'inconclusivo', 'inviavel'];
/** Resultado laboratorial normalizado (só os campos conhecidos, textos curtos); null = sem resultado. */
function labObjeto_(v) {
  const o = v && typeof v === 'object' ? v : lerJSONSeguro_(v, null);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const dia = function (x) { x = String(x || '').slice(0, 10); return diaValido_(x) ? x : ''; };
  const r = { laboratorio: textoCurto_(o.laboratorio, 60), laboratorioOutro: textoCurto_(o.laboratorioOutro, 80), envio: dia(o.envio), laudo: textoCurto_(o.laudo, 60),
              dataResultado: dia(o.dataResultado), resultado: LAB_RESULTADOS.indexOf(o.resultado) >= 0 ? o.resultado : 'aguardando',
              praga: textoCurto_(o.praga, 120), obs: textoCurto_(o.obs, 500), atualizadoEm: Number(o.atualizadoEm) || 0, por: textoCurto_(o.por, 80) };
  if (!r.laboratorio && !r.envio && !r.laudo && !r.dataResultado && r.resultado === 'aguardando' && !r.obs && !r.praga) return null;
  return r;
}
function labTexto_(v) { const o = labObjeto_(v); return o ? JSON.stringify(o) : ''; }
/** Entre o resultado gravado e o recebido, fica o de atualizadoEm maior (empate: o gravado). */
function labMaisNovo_(atual, novo) {
  const a = labObjeto_(atual), b = labObjeto_(novo);
  if (!b) return a ? JSON.stringify(a) : '';
  if (!a) return JSON.stringify(b);
  return b.atualizadoEm > a.atualizadoEm ? JSON.stringify(b) : JSON.stringify(a);
}
/** Praga do termo de colheita: a confirmada no resultado positivo; senão a da amostra do levantamento ligado (mesma cultura); senão o tipo de análise. */
function pragaDoTermo_(c, levPorId) {
  const lab = labObjeto_(c.laboratorio);
  if (lab && lab.resultado === 'positivo' && lab.praga) return lab.praga;
  const lev = levPorId && c.levantamentoId ? levPorId[c.levantamentoId] : null;
  if (lev) {
    const pr = pragasLev_(lev), cu = String(c.cultura || '').trim();
    const g = pr.filter(function (x) { return x.praga && x.culturas.some(function (y) { return y.cultura === cu && y.coleta === 'Sim'; }); })[0]
           || pr.filter(function (x) { return x.praga && x.culturas.some(function (y) { return y.cultura === cu; }); })[0]
           || pr.filter(function (x) { return x.praga && x.culturas.some(function (y) { return y.coleta === 'Sim'; }); })[0];
    if (g) return g.praga;
  }
  return textoCurto_(c.analise, 120);
}

/** Painel → PCE → termos de colheita: o administrador registra o resultado laboratorial (grava SÓ a coluna laboratorio, com quem/quando). */
function painelPceLaudo(token, req) {
  const admin = adminDoToken_(token), id = String(req.id || '').slice(0, 64);
  const lab = labObjeto_(req.laboratorio);
  if (!id) throw new Error('Termo de colheita não informado.');
  if (!lab) throw new Error('Informe o resultado laboratorial (laboratório, datas, nº do laudo ou resultado).');
  if (lab.laboratorio === 'Outro' && !lab.laboratorioOutro) throw new Error('Informe o nome do laboratório (opção "Outro").');
  if (lab.envio && lab.dataResultado && lab.dataResultado < lab.envio) throw new Error('A data do resultado é anterior à data de envio.');
  if (lab.resultado === 'positivo' && !lab.praga) throw new Error('Resultado positivo: informe a praga confirmada.');
  if (CONV_RE_CPF.test(lab.obs + ' ' + lab.laudo)) throw new Error('Não informe CPF no resultado (LGPD).');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = lerTudo_('Colheitas'), il = t.cols.indexOf('laboratorio'), is = t.cols.indexOf('srv_ts');
    for (let i = 0; i < t.valores.length; i++) {
      if (String(t.valores[i][0]) !== id) continue;
      const o = paraObjeto_(t.cols, t.valores[i]);
      if (o.excluido === 1) break;
      const agora = Date.now();
      lab.atualizadoEm = agora; lab.por = admin;
      t.sh.getRange(i + 2, il + 1).setValue(JSON.stringify(lab));
      t.sh.getRange(i + 2, is + 1).setValue(agora);                       // o aparelho do servidor recebe o resultado no próximo sync (atualizadoEm do termo não muda)
      return { ok: true, id: id, numeroTxt: o.numeroTxt, laboratorio: lab };
    }
    throw new Error('Termo de colheita não encontrado.');
  } finally { lock.releaseLock(); }
}

/* ---------- Relatório GDV (painel → aba Relatórios; só administrador) ----------
 * Relatório técnico parcial (mensal) e consolidado (anual) da Gerência de Defesa Vegetal, no modelo do relatório técnico anual.
 * painelRelGdvApuracao {de, ate, grupos}: SÓ AGREGADOS (por mês, por município, por praga) + a lista do anexo por propriedade com
 * CPF/CNPJ mascarado, produtor só com as iniciais e coordenadas arredondadas a 2 casas (~1 km). Os grupos de pragas (CONFIG.RELGDV) vêm
 * do painel. Textos e lançamentos manuais: abas RelGdvTextos / RelGdvLancamentos (painelRelGdv, painelRelGdvSalvar). */
const RELGDV_RE_CHAVE = /^(pce|vig|mun|hlb)\.[A-Za-z0-9_.|À-ÖØ-öø-ÿ'’ ()\/-]{1,100}$/;
const RELGDV_TABS = { 'tab.cfo': ['produto', 'documentos', 'quantidade', 'unidade'], 'tab.ptv': ['produto', 'documentos', 'quantidade', 'unidade'],
                      'tab.educacao': ['tipo', 'descricao', 'periodo', 'local', 'publico', 'atingido'] };
const RELGDV_NUM_TAB = ['documentos', 'quantidade', 'atingido'];
function mesRelGdv_(v) {
  const m = String(v === null || v === undefined ? '' : v).padStart(2, '0');
  if (!/^(0[1-9]|1[0-2])$/.test(m)) throw new Error('Mês inválido: ' + v + '.');
  return m;
}
function anoRelGdv_(v) { const a = Number(v); if (!(a >= 2000 && a <= 2100) || Math.round(a) !== a) throw new Error('Ano inválido.'); return a; }
/** Mesmo id de propriedade do app (código; sem código, CPF/CNPJ + nome da propriedade normalizado). */
function propIdGdv_(codigo, doc, nome) {
  const cod = String(codigo || '').trim(), d = digitos_(doc), n = String(nome || '').trim();
  return (cod || (d && n ? d + '|' + n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() : '')).slice(0, 64).trim();
}
/** Iniciais do produtor ("Raimundo Nonato da Silva" → "R. N. S."): o anexo nunca leva o nome completo (LGPD). */
function iniciaisRelGdv_(nome) {
  return String(nome || '').trim().split(/\s+/).filter(function (p) { return p && !/^(d[aeo]s?|e)$/i.test(p); })
    .map(function (p) { return p.charAt(0).toUpperCase() + '.'; }).join(' ').slice(0, 30);
}

/** Textos e lançamentos do ano (e os textos do ano anterior, para pré-preencher janeiro / o anual seguinte). */
function painelRelGdv(token, req) {
  const admin = adminDoToken_(token), ano = req.ano ? anoRelGdv_(req.ano) : Number(hojeManaus_().slice(0, 4));
  return { ok: true, admin: admin, hoje: hojeManaus_(), ano: ano,
    textos: lerLeitura_('RelGdvTextos').filter(function (r) { return r.id && (r.ano === ano || r.ano === ano - 1); }).map(function (r) {
      return { id: r.id, tipo: r.tipo, ano: r.ano, mes: r.mes, textos: lerJSONSeguro_(r.textos, {}), usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }),
    lancamentos: lerLeitura_('RelGdvLancamentos').filter(function (r) { return r.id && r.ano === ano; }).map(function (r) {
      return { mes: r.mes, chave: r.chave, valor: numOuNulo_(r.valor), lista: r.lista ? lerJSONSeguro_(r.lista, []) : null, usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }) };
}

/**
 * Painel: salva os textos de um relatório (tipo|ano|mês). Os NÚMEROS lançados à mão (quadro PCE, colunas por município, tabelas de
 * CFO/CFOC, PTV e educação sanitária, armadilhas do HLB) passaram para o Portal do Administrativo (admRelLancar): com lançamentos,
 * o painel recusa.
 */
function painelRelGdvSalvar(token, req) {
  const admin = adminDoToken_(token), ano = anoRelGdv_(req.ano), agora = Date.now();
  if (Array.isArray(req.lancamentos) && req.lancamentos.length) throw new Error(MSG_PORTAL);
  let txt = null;
  if (req.textos) {
    const tipo = ['anual', 'mensal', 'vigifito'].indexOf(req.tipo) >= 0 ? req.tipo : '';
    if (!tipo) throw new Error('Tipo de relatório inválido (mensal, anual ou vigifito).');
    // VIGIFITO: textos por período do relatório — MM (mês), S1/S2 (semestre), P<início> (período de 10 dias) ou vazio (anual)
    if (tipo === 'vigifito' && !/^(|0[1-9]|1[0-2]|S[12]|P\d{4}-\d{2}-\d{2})$/.test(String(req.mes || ''))) throw new Error('Período do relatório VIGIFITO inválido.');
    const mes = tipo === 'mensal' ? mesRelGdv_(req.mes) : tipo === 'vigifito' ? String(req.mes || '') : '', out = {};
    if (typeof req.textos !== 'object' || Array.isArray(req.textos)) throw new Error('Textos inválidos.');
    Object.keys(req.textos).forEach(function (k) {
      if (!/^[A-Za-z0-9_:.-]{1,40}$/.test(k) || Object.keys(out).length >= 60) throw new Error('Campo de texto inválido: ' + k + '.');
      if (k === 'assinaturas') {
        const a = req.textos[k];
        if (!Array.isArray(a) || a.length > 3) throw new Error('Assinaturas: até 3 linhas.');
        out[k] = a.map(function (x, i) { return { nome: convTexto_(x && x.nome, 100, 'Assinatura ' + (i + 1)), cargo: convTexto_(x && x.cargo, 140, 'Cargo ' + (i + 1)) }; });
      } else if (k === 'anexo') out[k] = req.textos[k] ? 1 : 0;
      else out[k] = convTexto_(req.textos[k], 8000, 'Texto ' + k);
    });
    const json = JSON.stringify(out);
    if (json.length > 45000) throw new Error('Textos grandes demais.');
    txt = { id: tipo + '|' + ano + '|' + mes, tipo: tipo, ano: ano, mes: mes, textos: json, usuario: admin, atualizadoEm: agora };
  }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (txt) convGravar_('RelGdvTextos', txt);
    return { ok: true, ano: ano, gravados: 0, usuario: admin, atualizadoEm: agora,
             textos: txt ? { id: txt.id, tipo: txt.tipo, ano: ano, mes: txt.mes, textos: JSON.parse(txt.textos), usuario: admin, atualizadoEm: agora } : null };
  } finally { lock.releaseLock(); }
}

/** Contagens dos lançamentos do relatório: inteiras (só a área controlada, em ha, e a quantidade das tabelas aceitam decimais). */
function relGdvInteiro_(chave) { return chave !== 'pce.areaControlada'; }

/**
 * Portal do Administrativo → linhas manuais do Relatório GDV: lançamentos por mês e linha ({mes, chave, valor} ou {mes, chave, lista}).
 * Valor vazio = linha sem lançamento. Valida mês, chave, números ≥ 0, contagens inteiras, textos com limite e sem CPF; só regrava linha
 * que mudou (quem/quando e o histórico só mudam quando o valor muda). O VIGIFITO tem lançamento próprio por posto (admVigLancar).
 */
function relGdvLancar_(s, req) {
  const ano = anoRelGdv_(req.ano), agora = Date.now();
  const lancs = Array.isArray(req.lancamentos) ? req.lancamentos : [];
  if (!lancs.length) throw new Error('Nada a gravar.');
  if (lancs.length > 3000) throw new Error('Lançamentos demais numa vez.');
  const linhas = lancs.map(function (l) {
    if (!l || typeof l !== 'object') throw new Error('Lançamento inválido.');
    const mes = mesRelGdv_(l.mes), chave = String(l.chave || '');
    const o = { id: ano + '|' + mes + '|' + chave, ano: ano, mes: mes, chave: chave, valor: '', lista: '', usuario: s.nome, atualizadoEm: agora, admId: s.admId };
    if (RELGDV_TABS[chave]) {
      const campos = RELGDV_TABS[chave], lista = Array.isArray(l.lista) ? l.lista : [];
      if (lista.length > 200) throw new Error('Tabela com linhas demais (máx. 200 por mês).');
      const ok = lista.map(function (x) {
        const y = {};
        campos.forEach(function (c) {
          if (RELGDV_NUM_TAB.indexOf(c) >= 0) {
            const n = x && x[c] !== '' && x[c] !== null && x[c] !== undefined ? convNumero_(x[c], c) : null;
            if (n !== null && (n < 0 || n > 1e9)) throw new Error(c + ' inválido (use números de 0 em diante).');
            if (n !== null && c !== 'quantidade' && Math.round(n) !== n) throw new Error(c + ': contagem com decimal (use número inteiro).');
            y[c] = n;
          }
          else y[c] = convTexto_(x && x[c], c === 'descricao' ? 1000 : 200, c);
        });
        return y;
      }).filter(function (y) { return campos.some(function (c) { return y[c] !== null && y[c] !== ''; }); });
      o.lista = lista.length || ok.length ? JSON.stringify(ok) : '';
    } else {
      if (!RELGDV_RE_CHAVE.test(chave)) throw new Error('Linha do relatório inválida: ' + chave + '.');
      if (/^vig\./.test(chave)) throw new Error('VIGIFITO: lance os valores por posto (aba VIGIFITO do portal).');
      const v = l.valor === '' || l.valor === null || l.valor === undefined ? '' : convNumero_(l.valor, 'Valor de ' + chave);
      if (v !== '' && (v < 0 || v > 1e9)) throw new Error('Valor de ' + chave + ' inválido (use números de 0 em diante).');
      if (v !== '' && relGdvInteiro_(chave) && Math.round(v) !== v) throw new Error('Valor de ' + chave + ': contagem com decimal (use número inteiro).');
      o.valor = v === '' ? '' : Math.round(v * 1000) / 1000;
    }
    return o;
  });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    let gravados = 0;
    const hist = [];
    const t = lerTudo_('RelGdvLancamentos'), cols = t.cols, idx = {}, iV = cols.indexOf('valor'), iL = cols.indexOf('lista'), novas = [];
    t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });
    linhas.forEach(function (o) {
      const i = idx[o.id], linha = cols.map(function (c) { return o[c]; });
      if (i === undefined) { if (o.valor === '' && !o.lista) return; idx[o.id] = -1; novas.push(linha); gravados++; hist.push([o.id, '', o.lista || o.valor]); return; }
      if (i < 0) return;
      if (String(t.valores[i][iV]) === String(o.valor) && String(t.valores[i][iL]) === String(o.lista)) return;   // sem mudança: não troca quem/quando
      hist.push([o.id, t.valores[i][iL] || t.valores[i][iV], o.lista || o.valor]);
      t.sh.getRange(i + 2, 1, 1, cols.length).setValues([linha]); gravados++;
    });
    if (novas.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
    admHistLote_(s, 'gravar', 'RelGdvLancamentos', hist);
    return { ok: true, ano: ano, gravados: gravados, usuario: s.nome, atualizadoEm: agora };
  } finally { lock.releaseLock(); }
}

/** Grupos de pragas pedidos pelo painel (CONFIG.RELGDV.grupos), validados: [{id, colunas:[{rotulo, termos normalizados}]}]. */
function relGdvGrupos_(g) {
  if (!Array.isArray(g) || g.length > 20) throw new Error('Grupos de pragas inválidos.');
  return g.map(function (x) {
    if (!x || !/^[a-z0-9_-]{1,30}$/.test(String(x.id || ''))) throw new Error('Grupo de pragas inválido.');
    if (!Array.isArray(x.colunas) || !x.colunas.length || x.colunas.length > 10) throw new Error('Colunas do grupo ' + x.id + ' inválidas.');
    return { id: x.id, colunas: x.colunas.map(function (c) {
      const t = (Array.isArray(c && c.pragas) ? c.pragas : []).slice(0, 12).map(function (p) { return normPub_(String(p).slice(0, 80)); }).filter(Boolean);
      if (!t.length) throw new Error('Coluna sem praga no grupo ' + x.id + '.');
      return { rotulo: textoCurto_(c.rotulo, 80), termos: t };
    }) };
  });
}
/** Quantidade → toneladas (kg ÷ 1000; t/ton × 1); outra unidade (caixas, sacos…) → null (não se inventa conversão). */
function toneladas_(q, u) {
  const n = normPub_(u).replace(/ /g, '');
  if (['kg', 'kgs', 'quilo', 'quilos', 'quilograma', 'quilogramas'].indexOf(n) >= 0) return q / 1000;
  if (['t', 'ton', 'tons', 'tonelada', 'toneladas'].indexOf(n) >= 0) return q;
  return null;
}

function painelRelGdvApuracao(token, req) {
  adminDoToken_(token);
  const de = String(req.de || ''), ate = String(req.ate || '');
  if (!diaValido_(de) || !diaValido_(ate) || de > ate) throw new Error('Período inválido.');
  if (somarDias_(de, 366) < ate) throw new Error('Período longo demais (até um ano).');
  return relGdvApurar_(de, ate, relGdvGrupos_(req.grupos || []));
}

/**
 * Apuração do Relatório GDV no intervalo [de, ate]: quadro PCE por mês (e o total do intervalo, com propriedades e área por
 * propriedades DISTINTAS), tabelas por grupo de pragas e município, resultados de laboratório por praga, VIGIFITO por mês
 * (BVAs fixas × volantes) e o anexo por propriedade (dados pessoais mascarados). Nada de nome, CPF completo ou coordenada exata.
 */
function relGdvApurar_(de, ate, grupos) {
  const noPer = function (d) { d = String(d || '').slice(0, 10); return d >= de && d <= ate; };
  const mesDe = function (d) { return String(d).slice(0, 7); };
  const meses = [];
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7) && meses.length < 14; ) {
    meses.push(m);
    const a = Number(m.slice(0, 4)), b = Number(m.slice(5, 7));
    m = b === 12 ? (a + 1) + '-01' : a + '-' + String(b + 1).padStart(2, '0');
  }
  const diaMs = function (ms) { ms = Number(ms) || 0; return ms > 0 ? new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10) : ''; };
  const nomeMun = {}, munK = function (s) { return normPub_(s).replace(/ (am|amazonas)$/, ''); };
  const mun = function (s) { const k = munK(s); if (!k) return ''; if (!nomeMun[k]) nomeMun[k] = String(s).trim(); return k; };
  const round = function (v, c) { const f = Math.pow(10, c); return Math.round(v * f) / f; };
  // praga → grupo/coluna: casa por "contém"; vale o termo mais longo
  const termos = [], cache = {};
  grupos.forEach(function (g, gi) { g.colunas.forEach(function (c, ci) { c.termos.forEach(function (t) { termos.push({ t: t, gi: gi, ci: ci }); }); }); });
  const classif = function (praga) {
    const n = normPub_(praga); if (!n) return null;
    if (n in cache) return cache[n];
    let best = null; termos.forEach(function (x) { if (n.indexOf(x.t) >= 0 && (!best || x.t.length > best.t.length)) best = x; });
    return (cache[n] = best);
  };
  const RES_TXT = { detectada: 'detectada', suspeita: 'suspeita', nao_detectada: 'não detectada' };

  // propriedades: data de cadastro = a menor entre a criação na aba Propriedades e o primeiro levantamento (todo o histórico)
  const propCriado = {}; lerLeitura_('Propriedades').forEach(function (p) { if (p.id) propCriado[p.id] = diaMs(p.criadoEm); });
  const levTodos = lerLeitura_('Levantamentos').filter(function (r) { return r.id && r.excluido !== 1; });
  const chaveProp = function (r) { return propIdGdv_(r.codigoPropriedade, r.doc, r.propriedade) || 'lev:' + r.id; };
  const primeiroLev = {}, levPorId = {};
  levTodos.forEach(function (r) { levPorId[r.id] = r; const k = chaveProp(r); if (r.data && (!primeiroLev[k] || r.data < primeiroLev[k])) primeiroLev[k] = r.data; });
  const cadastroDe = function (k) { const a = propCriado[k] || '', b = primeiroLev[k] || ''; return a && b ? (a < b ? a : b) : (a || b); };

  const z = function () { return { props: {}, novas: {}, levs: 0, porCol: {}, outras: 0, area: {}, fisc: 0, educ: 0, upuc: {}, colheitas: 0, amostras: 0 }; };
  const PM = {}, TOT = z();
  meses.forEach(function (m) { PM[m] = z(); });
  const ehUpUc = function (s) { const n = normPub_(s); return n.indexOf('unidade de producao') >= 0 || n.indexOf('unidade de consolidacao') >= 0 || /(^| )(up|uc)( |$)/.test(n); };
  const G = grupos.map(function () { return { mun: {}, anexo: [], levs: 0, props: {}, viveiros: {} }; });
  const munsLev = {}, porTipoLocal = {}, porOrigem = {};
  let nLev = 0, deteccoes = 0, suspeitas = 0;
  levTodos.forEach(function (r) {
    if (!noPer(r.data)) return;
    const m = mesDe(r.data), pm = PM[m]; if (!pm) return;
    nLev++;
    const k = chaveProp(r), mk = mun(r.municipio);
    if (mk) munsLev[mk] = true;
    const pr = pragasLev_(r), porCult = {};
    pr.forEach(function (g) { g.culturas.forEach(function (c) { porCult[c.cultura] = Math.max(porCult[c.cultura] || 0, c.area || 0); }); });
    [pm, TOT].forEach(function (x) {
      x.props[k] = true; x.levs++;
      const a = x.area[k] = x.area[k] || {};
      Object.keys(porCult).forEach(function (cu) { a[cu] = Math.max(a[cu] || 0, porCult[cu]); });
    });
    const cad = cadastroDe(k);
    if (cad && mesDe(cad) === m) pm.novas[k] = true;
    if (cad && cad >= de && cad <= ate) TOT.novas[k] = true;
    const tl = String(r.tipoLocal || '').trim(), ov = String(r.origemVisita || '').trim();
    porTipoLocal[tl || 'Não informado'] = (porTipoLocal[tl || 'Não informado'] || 0) + 1;
    porOrigem[ov || 'Não informada'] = (porOrigem[ov || 'Não informada'] || 0) + 1;
    if (tl && ehUpUc(tl)) [pm, TOT].forEach(function (x) { x.upuc[k + '|' + r.data] = true; });
    const colVistas = {}, porGrupo = {};
    let outras = false;
    pr.forEach(function (g) {
      g.culturas.forEach(function (c) { if (c.resultado !== 'nao_detectada') { deteccoes++; if (c.resultado === 'suspeita') suspeitas++; } });
      const cl = classif(g.praga);
      if (!cl) { if (g.praga) outras = true; return; }
      colVistas[cl.gi + ':' + cl.ci] = true;
      (porGrupo[cl.gi] = porGrupo[cl.gi] || []).push({ ci: cl.ci, g: g });
    });
    Object.keys(colVistas).forEach(function (c) { [pm, TOT].forEach(function (x) { x.porCol[c] = (x.porCol[c] || 0) + 1; }); });
    if (outras) [pm, TOT].forEach(function (x) { x.outras++; });
    Object.keys(porGrupo).forEach(function (gi) {
      const GG = G[gi], nc = grupos[gi].colunas.length;
      const M = GG.mun[mk || '?'] = GG.mun[mk || '?'] || { props: {}, levs: 0, det: grupos[gi].colunas.map(function () { return {}; }), susp: grupos[gi].colunas.map(function () { return {}; }), suspeitas: {}, amostras: 0 };
      M.props[k] = true; M.levs++; GG.levs++; GG.props[k] = true;
      if (normPub_(tl) === 'viveiro') GG.viveiros[k] = true;
      const culturas = [], res = [];
      porGrupo[gi].forEach(function (x) {
        x.g.culturas.forEach(function (c) {
          if (culturas.indexOf(c.cultura) < 0) culturas.push(c.cultura);
          if (c.resultado === 'detectada') M.det[x.ci][k] = true;
          if (c.resultado === 'suspeita') { M.susp[x.ci][k] = true; M.suspeitas[k] = true; }
          if (c.coleta === 'Sim') M.amostras++;
        });
        const pior = x.g.culturas.some(function (c) { return c.resultado === 'detectada'; }) ? 'detectada' : x.g.culturas.some(function (c) { return c.resultado === 'suspeita'; }) ? 'suspeita' : 'nao_detectada';
        res.push(x.g.praga + ': ' + RES_TXT[pior]);
      });
      void nc;
      const la = numOuNulo_(r.lat), lo = numOuNulo_(r.lon);
      GG.anexo.push({ municipio: nomeMun[mk] || String(r.municipio || ''), propriedade: textoCurto_(r.propriedade, 120), produtor: iniciaisRelGdv_(r.nome),
                      doc: mascararDoc_(r.doc), data: r.data, culturas: culturas.join(', '), resultado: res.join('; '), tipoLocal: tl,
                      lat: la === null ? null : round(la, 2), lon: lo === null ? null : round(lo, 2) });
    });
  });

  // Termos de Fiscalização do PCE: termos, educação sanitária e fiscalização de UP/UC (visitas distintas: propriedade + data)
  lerLeitura_('TermosPCE').forEach(function (t) {
    if (!t.id || t.excluido === 1 || t.cancelado === 1 || !noPer(t.data)) return;
    const pm = PM[mesDe(t.data)]; if (!pm) return;
    const acoes = lerJSONSeguro_(t.acoes, []), tl = lerJSONSeguro_(t.tipoLocal, []);
    const k = String(t.propriedadeId || '').trim() || (digitos_(t.doc) ? digitos_(t.doc) + '|' + normPub_(t.nome) : 'termo:' + t.id);
    [pm, TOT].forEach(function (x) {
      x.fisc++;
      if ((Array.isArray(acoes) ? acoes : []).some(function (a) { return normPub_(a) === 'educacao sanitaria'; })) x.educ++;
      if ((Array.isArray(tl) ? tl : []).some(ehUpUc)) x.upuc[k + '|' + t.data] = true;
    });
  });

  // Termos de Colheita: termos (data do termo), amostras enviadas (data de envio) e resultados por praga
  const LAB = {}, positivos = [], hoje = hojeManaus_();
  let semResultado30 = 0, semResultado = 0;
  lerLeitura_('Colheitas').forEach(function (c) {
    if (!c.id || c.excluido === 1 || c.cancelado === 1) return;
    const lab = labObjeto_(c.laboratorio), q = quantidade_(c.quantidade) || 1;
    if (noPer(c.data) && PM[mesDe(c.data)]) {
      [PM[mesDe(c.data)], TOT].forEach(function (x) { x.colheitas++; });
      const praga = pragaDoTermo_(c, levPorId) || 'Não informada';
      const L = LAB[praga] = LAB[praga] || { praga: praga, termos: 0, amostras: 0, enviadas: 0, aguardando: 0, negativo: 0, positivo: 0, inconclusivo: 0, inviavel: 0 };
      const res = lab ? lab.resultado : 'aguardando';
      L.termos++; L.amostras += q; L[res]++;
      if (lab && (lab.envio || lab.laboratorio)) L.enviadas += q;
      if (res === 'positivo') positivos.push({ praga: (lab && lab.praga) || praga, municipio: String(c.municipio || ''), data: (lab && lab.dataResultado) || c.data });
      if (res === 'aguardando') { semResultado++; if (somarDias_((lab && lab.envio) || c.data, 30) < hoje) semResultado30++; }
    }
    const env = lab ? (lab.envio || (lab.laboratorio ? c.data : '')) : '';
    if (env && noPer(env) && PM[mesDe(env)]) [PM[mesDe(env)], TOT].forEach(function (x) { x.amostras += q; });
  });

  const fechar = function (x) {
    const props = Object.keys(x.props), novas = Object.keys(x.novas).filter(function (k) { return x.props[k]; }).length;
    const area = props.reduce(function (s, k) { const a = x.area[k] || {}; return s + Object.keys(a).reduce(function (t, cu) { return t + a[cu]; }, 0); }, 0);
    return { propVisitadas: props.length, propNovas: novas, propAntigas: props.length - novas, inspecoes: x.levs, porCol: x.porCol, outras: x.outras,
             area: round(area, 2), termosFisc: x.fisc, educacao: x.educ, upuc: Object.keys(x.upuc).length, colheitas: x.colheitas, amostras: x.amostras };
  };
  const porMes = {}; meses.forEach(function (m) { porMes[m] = fechar(PM[m]); });

  // VIGIFITO: a soma dos postos do VIGIFITO por tipo (BVAs fixas × volantes), do mesmo motor (vigApurar_ → motorBarreira_): o bloco do
  // Relatório GDV/consolidado nunca diverge do relatório VIGIFITO. Postos não mapeados entram em "outras" do mesmo tipo.
  const V = { fixa: {}, volante: {} };
  meses.forEach(function (m) { V.fixa[m] = vigZero_(); V.volante[m] = vigZero_(); });
  const VA = vigApurar_(vigConfig_(), de, ate), tipoP = {};
  VA.postos.forEach(function (p) { tipoP[p.id] = p.tipo; });
  Object.keys(VA.porMes).forEach(function (pid) {
    Object.keys(VA.porMes[pid]).forEach(function (m) {
      const x = V[tipoP[pid] || 'fixa'][m], y = VA.porMes[pid][m]; if (!x) return;
      Object.keys(y).forEach(function (k) {
        if (k === 'outrasUnidades') Object.keys(y[k]).forEach(function (pr) { const o = x[k][pr] = x[k][pr] || {}; Object.keys(y[k][pr]).forEach(function (u) { o[u] = (o[u] || 0) + y[k][pr][u]; }); });
        else x[k] += y[k];
      });
    });
  });
  ['fixa', 'volante'].forEach(function (b) { meses.forEach(function (m) { const x = V[b][m]; x.liberacaoT = round(x.liberacaoT, 3); x.apreensaoT = round(x.apreensaoT, 3); }); });

  const gruposOut = grupos.map(function (g, gi) {
    const GG = G[gi];
    const municipios = Object.keys(GG.mun).map(function (k) {
      const M = GG.mun[k];
      return { municipio: k === '?' ? 'Não informado' : nomeMun[k], propriedades: Object.keys(M.props).length, levantamentos: M.levs,
               det: M.det.map(function (o) { return Object.keys(o).length; }), susp: M.susp.map(function (o) { return Object.keys(o).length; }),
               suspeitas: Object.keys(M.suspeitas).length, amostras: M.amostras };
    }).sort(function (a, b) { return a.municipio.localeCompare(b.municipio); });
    return { id: g.id, municipios: municipios, levantamentos: GG.levs, propriedades: Object.keys(GG.props).length, viveiros: Object.keys(GG.viveiros).length,
             anexo: GG.anexo.sort(function (a, b) { return a.municipio.localeCompare(b.municipio) || String(a.data).localeCompare(String(b.data)); }) };
  });
  return { ok: true, de: de, ate: ate, apuradoEm: Date.now(), meses: meses,
           resumo: { municipiosLevantados: Object.keys(munsLev).length, municipios: Object.keys(munsLev).map(function (k) { return nomeMun[k]; }).sort(),
                     levantamentos: nLev, deteccoes: deteccoes, suspeitas: suspeitas, porTipoLocal: porTipoLocal, porOrigem: porOrigem },
           quadro: { porMes: porMes, total: fechar(TOT) }, grupos: gruposOut,
           laboratorio: { porPraga: Object.keys(LAB).sort().map(function (k) { return LAB[k]; }), positivos: positivos, semResultado: semResultado, semResultado30: semResultado30 },
           vigifito: V };
}

/* ---------- UF de origem/destino (veículo e TF) ---------- */
const UFS_ = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
              'SE', 'SP', 'TO', 'Exterior'];   // = CONFIG.ufs do app
/** UF informada (select do app): sigla conhecida (maiúscula) ou "Exterior"; qualquer outra coisa = vazio. */
function ufNorm_(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  if (s === 'EXTERIOR') return 'Exterior';
  return s.length === 2 && UFS_.indexOf(s) >= 0 ? s : '';
}
/** Normaliza ufOrigem/ufDestino de um registro recebido (TF ou veículo), só nos campos que vieram. */
function ufsNorm_(r) {
  if (!r || typeof r !== 'object') return;
  ['ufOrigem', 'ufDestino'].forEach(function (c) { if (c in r) r[c] = ufNorm_(r[c]); });
}
/** TF antigo (sem coluna de UF): UF no fim do texto de origem/destino — "PORTO VELHO/RO", "BOA VISTA - RR", "MANAUS (AM)", "RR",
 *  "LIMA, EXTERIOR". Sigla precisa estar separada (espaço, /, -, vírgula, parêntese): "MANAUS" não vira "US". Sem sigla válida = vazio. */
function ufDoTexto_(t) {
  const s = String(t == null ? '' : t).trim().toUpperCase();
  if (!s) return '';
  const m = /(?:^|[\s\/\-–—,.(])(EXTERIOR|[A-Z]{2})\)?\.?$/.exec(s);
  return m ? ufNorm_(m[1]) : '';
}

/* ---------- Motor de indicadores das barreiras (fonte única para VIGIFITO, Relatório GDV e convênio 1.9/1.10) ----------
 * Cada número das barreiras é definido UMA vez aqui (fonte + regra) e usado por todos os relatórios: o VIGIFITO por posto, o bloco
 * VIGIFITO do Relatório GDV/consolidado (soma dos postos por tipo) e as etapas 1.9/1.10 do convênio — o mesmo número nunca diverge.
 * Regras: turno = registro de barreira (data = data de INÍCIO do turno: um turno que começa no dia da troca da escala conta no
 * período que começa nesse dia); veículos = registros não excluídos do turno; pessoas = soma do campo pessoas (estimativa por tipo de
 * veículo); TF = não cancelado, contado pela data do turno em que foi lavrado (TF sem turno: data do TF, como BVA fixa); posto
 * "Móvel"/"volante" = volante, senão fixa; toneladas = produtos em kg (÷ 1.000) ou t; outras unidades à parte, sem conversão.
 * Indicadores de fiscalização (regras da gerência, 2026-10):
 *   educacao     = pessoas a bordo dos veículos do turno (cada pessoa recebe a orientação de educação sanitária);
 *   medidaFito, partidas = 1 por TF de barreira; inspecaoFito = TF com "Inspeção" marcada; documentos = TF com documento preenchido;
 *   UF do TF = coluna ufOrigem/ufDestino; TF antigo: UF no fim do texto de origem/destino (ufDoTexto_); senão a do veículo ligado;
 *   internN/internT/importT = TF de outra UF (ou do exterior) com destino ao AM (t = produtos do TF); cargasEstados/exportT = TF com
 *   destino a outra UF; outras unidades desses TFs à parte (outrasUnidades.carga). Veículo SEM TF ligado (TFs.veiculoId) com UF
 *   informada também conta em internN/cargasEstados (sem toneladas); com TF ligado, só o TF conta (nunca duas vezes).
 *   Os campos antigos de fiscalização do veículo (semEducacao, medidaFito, carga, produtos, partida, inspecaoFito, docConferido) não
 *   entram mais em nenhum número. */
function motorBarreira_(de, ate) {
  const noPer = function (d) { d = String(d || '').slice(0, 10); return d >= de && d <= ate; };
  const tipoDe = function (t) { const p = normPub_(t.posto); return p.indexOf('mov') >= 0 || p.indexOf('volante') >= 0 ? 'volante' : 'fixa'; };
  const todos = {}, turnos = [];
  lerLeitura_('Turnos').forEach(function (t) {
    if (!t.id) return;
    const o = { id: t.id, data: String(t.data || '').slice(0, 10), posto: t.posto, tipo: tipoDe(t), local: t.local, unidade: t.unidade, veiculos: 0, pessoas: 0,
                educacao: 0, cargasEstados: 0, internN: 0 };
    todos[t.id] = o;
    if (noPer(o.data)) turnos.push(o);
  });
  const dentro = {}; turnos.forEach(function (t) { dentro[t.id] = t; });
  const uf = String(PropertiesService.getScriptProperties().getProperty('UF_LOCAL') || 'AM').toUpperCase();
  // interestadual: destino AM vindo de outra UF = internalização; destino em outra UF = trânsito para outros estados
  const sentido = function (ori, des) { return des === uf && ori && ori !== uf ? 'intern' : des && des !== uf ? 'estados' : ''; };
  const tfsVivos = lerLeitura_('TFs').filter(function (f) { return f.id && f.cancelado !== 1; }), comTF = {};
  tfsVivos.forEach(function (f) { if (f.veiculoId) comTF[f.veiculoId] = 1; });
  const ufVeic = {};
  lerLeitura_('Veiculos').forEach(function (v) {
    if (!v.id) return;
    const ori = ufNorm_(v.ufOrigem), des = ufNorm_(v.ufDestino);
    ufVeic[v.id] = { ori: ori, des: des };
    const t = dentro[v.turnoId]; if (!t || v.excluido === 1) return;
    t.veiculos++; t.pessoas += Number(v.pessoas) || 0;
    t.educacao += Number(v.pessoas) || 0;                                     // educação sanitária: por pessoa a bordo
    if (comTF[v.id]) return;                                                  // veículo com TF: a origem/destino conta pelo TF
    const sv = sentido(ori, des);
    if (sv === 'intern') t.internN++; else if (sv === 'estados') t.cargasEstados++;
  });
  const tfs = [];
  tfsVivos.forEach(function (f) {
    const t = f.turnoId ? todos[f.turnoId] : null, data = t ? t.data : String(f.data || '').slice(0, 10);
    if (!noPer(data)) return;
    const vu = ufVeic[f.veiculoId] || {};
    const ori = ufNorm_(f.ufOrigem) || ufDoTexto_(f.origem) || vu.ori || '', des = ufNorm_(f.ufDestino) || ufDoTexto_(f.destino) || vu.des || '';
    const o = { id: f.id, turnoId: t ? t.id : '', veiculoId: f.veiculoId || '', data: data, tipo: t ? t.tipo : 'fixa', local: f.local, barreira: f.barreira, procedimento: f.procedimento,
                documentos: documentosTF_(f.documentos).length > 0, coleta: f.coleta === 1, amostras: f.coleta === 1 ? Number(f.amostras) || 0 : 0,
                inspecao: f.inspecao === 1, advertencia: f.advertencia === 1, fiel: f.fiel === 1, auto: f.auto === 1, liberacaoT: 0, apreensaoT: 0, outras: {},
                ufOrigem: ori, ufDestino: des, sentido: sentido(ori, des), cargaT: 0, outrasCarga: {} };
    produtosTF_(f.produtos).forEach(function (pr) {
      if (pr.quantidade === null) return;
      const tt = toneladas_(pr.quantidade, pr.unidade), u = pr.unidade || 'sem unidade';
      if (tt !== null) o.cargaT += tt; else o.outrasCarga[u] = (o.outrasCarga[u] || 0) + pr.quantidade;
      if (o.procedimento === 'liberacao' || o.procedimento === 'apreensao') {
        if (tt !== null) o[o.procedimento + 'T'] += tt; else o.outras[u] = (o.outras[u] || 0) + pr.quantidade;
      }
    });
    tfs.push(o);
  });
  return { turnos: turnos, tfs: tfs };
}

/* ---------- VIGIFITO (relatório por posto; postos e escala configuráveis; valores manuais lançados no portal) ---------- */
const VIG_IND = {   // indicador → [unidade, fonte] (rótulos e ordem no navegador: documentos/indicadores.js)
  veiculos: ['nº', 'auto'], documentos: ['nº', 'auto'], partidas: ['nº', 'auto'], inspecaoFito: ['nº', 'auto'], cargasEstados: ['nº', 'auto'],
  internN: ['nº', 'auto'], internT: ['t', 'auto'], coleta: ['nº', 'auto'], amostras: ['nº', 'auto'], educacao: ['nº', 'auto'], medidaFito: ['nº', 'auto'],
  abordagem: ['nº', 'auto'], capacitacao: ['nº', 'manual'], exportT: ['t', 'auto'], madeira: ['m3', 'manual'], importT: ['t', 'auto'],
  tfs: ['nº', 'auto'], inspecao: ['nº', 'auto'], advertencia: ['nº', 'auto'], rechaco: ['nº', 'auto'], fiel: ['nº', 'auto'], liberacao: ['nº', 'auto'],
  liberacaoT: ['t', 'auto'], infracao: ['nº', 'auto'], apreensao: ['nº', 'auto'], apreensaoT: ['t', 'auto'], autoDestN: ['nº', 'auto'], autoDestT: ['t', 'auto']
};
const VIG_OUTRAS = { fixa: { id: '_outras-fixas', nome: 'OUTRAS BVA FIXAS (não mapeadas)', municipio: '', tipo: 'fixa' },
                     volante: { id: '_outras-volantes', nome: 'OUTRAS AÇÕES VOLANTES (não mapeadas)', municipio: '', tipo: 'volante' } };
const VIG_RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/, VIG_RE_PER = /^P\d{4}-\d{2}-\d{2}$/;
/** Semente: os 11 postos da planilha de controle VIGIFITO 2025 e a escala de 10 dias do Jundiá (05/01/2025, ciclo de 9 dias). */
function vigSemente_() {
  const P = function (id, nome, municipio, tipo, locais) { return { id: id, nome: nome, municipio: municipio, tipo: tipo, locais: locais || [] }; };
  return { ancora: '2025-01-05', ciclo: 9, versao: 0, atualizadoEm: 0, atualizadoPor: '', postos: [
    P('pf-jundia', 'PRESIDENTE FIGUEIREDO - BVA JUNDIÁ', 'Presidente Figueiredo', 'fixa', ['BVA - JUNDIÁ']),
    P('pf-volante', 'PRESIDENTE FIGUEIREDO - VOLANTE', 'Presidente Figueiredo', 'volante'),
    P('manaus-aeroporto', 'MANAUS - BVA AEROPORTO', 'Manaus', 'fixa', ['BVA - AEROPORTO']),
    P('manaus-volante', 'MANAUS - VOLANTE', 'Manaus', 'volante'),
    P('parintins-porto', 'PARINTINS - BVA PORTO', 'Parintins', 'fixa', ['BVA - PARINTINS', 'BVA - PORTO DE PARINTINS']),
    P('parintins-volante', 'PARINTINS - BVA VOLANTE', 'Parintins', 'volante'),
    P('humaita-fixa', 'HUMAITÁ - BVA FIXA', 'Humaitá', 'fixa', ['BVA - HUMAITÁ']),
    P('iranduba-volante', 'IRANDUBA - BVA VOLANTE', 'Iranduba', 'volante'),
    P('guajara-volante', 'GUAJARÁ - BVA VOLANTE', 'Guajará', 'volante'),
    P('tabatinga-volante', 'TABATINGA - BVA VOLANTE (PORTO)', 'Tabatinga', 'volante'),
    P('benjamin-volante', 'BENJAMIN CONSTANT - BVA VOLANTE (PORTO)', 'Benjamin Constant', 'volante')] };
}
function vigConfig_() {
  const r = lerLeitura_('VigConfig').filter(function (x) { return x.id === 'vigifito'; })[0];
  const c = r ? lerJSONSeguro_(r.config, null) : null;
  return c && Array.isArray(c.postos) && c.postos.length ? c : vigSemente_();
}
/** Início (AAAA-MM-DD) do período de 10 dias da escala que contém o dia: âncora + k × ciclo (o dia da troca abre o período seguinte). */
function vigPeriodo_(cfg, dia) {
  const d0 = Date.UTC(+cfg.ancora.slice(0, 4), +cfg.ancora.slice(5, 7) - 1, +cfg.ancora.slice(8, 10)), d = Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));
  const k = Math.floor(Math.round((d - d0) / 864e5) / cfg.ciclo);
  return somarDias_(cfg.ancora, k * cfg.ciclo);
}
const vigZero_ = function () {
  return { turnos: 0, abordagem: 0, veiculos: 0, pessoas: 0, tfs: 0, documentos: 0, inspecao: 0, advertencia: 0, rechaco: 0, fiel: 0, liberacao: 0, liberacaoT: 0,
           apreensao: 0, apreensaoT: 0, infracao: 0, coleta: 0, amostras: 0, outrasUnidades: {},
           educacao: 0, medidaFito: 0, partidas: 0, inspecaoFito: 0, cargasEstados: 0, internN: 0, internT: 0, importT: 0, exportT: 0, autoDestN: 0, autoDestT: 0 };
};
/**
 * Apuração automática do VIGIFITO por posto, por mês (AAAA-MM) e por período de 10 dias (início AAAA-MM-DD), no intervalo [de, ate].
 * Turno → posto: fixa = local (ou unidade) do turno igual a um dos "locais" do posto (nomes de BVA de CONFIG.bvas/Barreiras); volante =
 * município do turno (unidade, ou o nome do município no local) igual ao do posto. Sem posto: "OUTRAS BVA FIXAS/AÇÕES VOLANTES (não
 * mapeadas)", listadas em naoMapeados (aviso no relatório). TF sem turno: pelo local do TF entre os locais das BVAs fixas.
 */
function vigApurar_(cfg, de, ate) {
  const M = motorBarreira_(de, ate);
  const munN = function (s) { return normPub_(s).replace(/ (am|amazonas)$/, ''); };
  const fixas = cfg.postos.filter(function (p) { return p.tipo === 'fixa'; }), vols = cfg.postos.filter(function (p) { return p.tipo === 'volante'; });
  const fixaDe = function (local, unidade) {
    // apelidos da mesma BVA (localCanon_) valem dos dois lados: posto configurado com "Barreira Porto da CEASA" pega os turnos "BVA - CEASA"
    const alvos = [normPub_(local), normPub_(localCanon_(local)), normPub_(unidade)].filter(Boolean);
    for (let i = 0; i < fixas.length; i++) if ((fixas[i].locais || []).some(function (l) { return [normPub_(l), normPub_(localCanon_(l))].some(function (n) { return n && alvos.indexOf(n) >= 0; }); })) return fixas[i].id;
    return null;
  };
  const volanteDe = function (t) {
    const u = munN(t.unidade), l = ' ' + normPub_(t.local) + ' ';
    for (let i = 0; i < vols.length; i++) { const m = munN(vols[i].municipio); if (m && (u === m || l.indexOf(' ' + m + ' ') >= 0)) return vols[i].id; }
    return null;
  };
  const porMes = {}, porPeriodo = {}, postoTurno = {}, nao = {};
  const celulas = function (pid, data) {
    const mes = data.slice(0, 7), per = vigPeriodo_(cfg, data);
    const a = porMes[pid] = porMes[pid] || {}, b = porPeriodo[pid] = porPeriodo[pid] || {};
    return [a[mes] = a[mes] || vigZero_(), b[per] = b[per] || vigZero_()];
  };
  M.turnos.forEach(function (t) {
    let pid = t.tipo === 'fixa' ? fixaDe(t.local, t.unidade) : volanteDe(t);
    if (!pid) {
      pid = VIG_OUTRAS[t.tipo].id;
      const k = t.tipo + '|' + String(t.local || '').trim() + '|' + String(t.unidade || '').trim();
      const n = nao[k] = nao[k] || { tipo: t.tipo, local: String(t.local || '').trim(), unidade: String(t.unidade || '').trim(), turnos: 0, veiculos: 0 };
      n.turnos++; n.veiculos += t.veiculos;
    }
    postoTurno[t.id] = pid;
    celulas(pid, t.data).forEach(function (x) {
      x.turnos++; if (t.tipo === 'volante') x.abordagem++; x.veiculos += t.veiculos; x.pessoas += t.pessoas;
      x.educacao += t.educacao; x.internN += t.internN; x.cargasEstados += t.cargasEstados;   // veículos sem TF ligado (motorBarreira_)
    });
  });
  const cadB = {}; lerLeitura_('Barreiras').forEach(function (b) { if (b.id) cadB[b.id] = b; });
  M.tfs.forEach(function (f) {
    let pid = f.turnoId ? postoTurno[f.turnoId] : null;
    if (!pid && !f.turnoId) { const c = cadB[f.barreira] || {}; pid = fixaDe(f.local, '') || fixaDe(c.nome, c.local) || VIG_OUTRAS.fixa.id; }
    if (!pid) pid = VIG_OUTRAS[f.tipo].id;
    celulas(pid, f.data).forEach(function (x) {
      x.tfs++; x.medidaFito++; x.partidas++;                                  // cada TF de barreira = medida fitossanitária e partida fiscalizada
      if (f.documentos) x.documentos++;                                       // exame de documentos: TF com NF/PTV/GTA/… preenchido
      if (f.inspecao) x.inspecaoFito++;                                       // inspeção fitossanitária = "Inspeção" do TF (16.1)
      if (f.sentido === 'intern') { x.internN++; x.internT += f.cargaT; x.importT += f.cargaT; }
      else if (f.sentido === 'estados') { x.cargasEstados++; x.exportT += f.cargaT; }
      if (f.sentido) Object.keys(f.outrasCarga).forEach(function (u) { const o = x.outrasUnidades.carga = x.outrasUnidades.carga || {}; o[u] = (o[u] || 0) + f.outrasCarga[u]; });
      if (f.inspecao) x.inspecao++; if (f.advertencia) x.advertencia++; if (f.fiel) x.fiel++; if (f.auto) x.infracao++;
      if (f.procedimento === 'apreensao') { x.autoDestN++; x.autoDestT += f.apreensaoT; }      // no e-GDV a apreensão é a apreensão para destruição
      if (f.coleta) { x.coleta++; x.amostras += f.amostras; }
      if (f.procedimento === 'rechaco') x.rechaco++;
      if (f.procedimento === 'liberacao' || f.procedimento === 'apreensao') {
        x[f.procedimento]++; x[f.procedimento + 'T'] += f[f.procedimento + 'T'];
        Object.keys(f.outras).forEach(function (u) { const o = x.outrasUnidades[f.procedimento] = x.outrasUnidades[f.procedimento] || {}; o[u] = (o[u] || 0) + f.outras[u]; });
      }
    });
  });
  const arred = function (G) { Object.keys(G).forEach(function (p) { Object.keys(G[p]).forEach(function (k) { const x = G[p][k];
    ['liberacaoT', 'apreensaoT', 'internT', 'importT', 'exportT', 'autoDestT'].forEach(function (c) { x[c] = Math.round(x[c] * 1000) / 1000; }); }); }); };
  arred(porMes); arred(porPeriodo);
  const postos = cfg.postos.map(function (p) { return { id: p.id, nome: p.nome, municipio: p.municipio, tipo: p.tipo }; });
  ['fixa', 'volante'].forEach(function (t) { if (porMes[VIG_OUTRAS[t].id]) postos.push(VIG_OUTRAS[t]); });
  return { ok: true, de: de, ate: ate, apuradoEm: Date.now(), ancora: cfg.ancora, ciclo: cfg.ciclo, postos: postos, porMes: porMes, porPeriodo: porPeriodo,
           naoMapeados: Object.keys(nao).map(function (k) { return nao[k]; }) };
}
/** Intervalo de apuração do ano: 1º/jan até 31/dez ou até o fim do último período de 10 dias que começa no ano. */
function vigIntervaloAno_(cfg, ano) {
  const ult = vigPeriodo_(cfg, ano + '-12-31'), fimUlt = somarDias_(ult, cfg.ciclo - 1);
  return { de: ano + '-01-01', ate: fimUlt > ano + '-12-31' ? fimUlt : ano + '-12-31' };
}
function vigLancOut_(r) {
  return { periodo: r.periodo, posto: r.posto, indicador: r.indicador, valor: numOuNulo_(r.valor), substitui: r.substitui === 1 ? 1 : 0, justificativa: r.justificativa,
           origem: r.origem || 'manual', arquivo: r.arquivo || '', usuario: r.usuario, atualizadoEm: r.atualizadoEm };
}
/** Configuração, lançamentos e apuração do ano (o painel e o portal usam a mesma resposta). */
function vigDados_(ano) {
  ano = anoRelGdv_(ano);
  const cfg = vigConfig_(), iv = vigIntervaloAno_(cfg, ano), a1 = String(ano);
  const lanc = lerLeitura_('VigLancamentos').filter(function (r) {
    if (!r.id || r.excluido === 1) return false;
    return String(r.periodo).slice(0, 4) === a1 || String(r.periodo).slice(1, 5) === a1;
  }).map(vigLancOut_);
  return { ok: true, ano: ano, hoje: hojeManaus_(), cfg: cfg, indicadores: VIG_IND, lancamentos: lanc, apuracao: vigApurar_(cfg, iv.de, iv.ate) };
}
function painelVigDados(token, req) { adminDoToken_(token); return vigDados_(req.ano || hojeManaus_().slice(0, 4)); }
function admVigDados_(s, req) { return vigDados_(req.ano || hojeManaus_().slice(0, 4)); }

/** Valor de um indicador: número ≥ 0; contagens (nº) inteiras; t e m³ com até 3 casas (kg não: converta para t). */
function vigValor_(ind, v, rot) {
  const n = typeof v === 'number' ? v : numOuNulo_(v);
  if (n === null || !isFinite(n)) throw new Error(rot + ': valor não numérico.');
  if (n < 0) throw new Error(rot + ': valor negativo (use números de 0 em diante).');
  if (n > 1e8) throw new Error(rot + ': valor grande demais.');
  if (VIG_IND[ind][0] === 'nº' && Math.round(n) !== n) throw new Error(rot + ': contagem com decimal (use número inteiro).');
  if (VIG_IND[ind][0] !== 'nº' && Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) throw new Error(rot + ': no máximo 3 casas decimais (' + VIG_IND[ind][0] + ').');
  return n;
}
/**
 * Grava valores do VIGIFITO (portal): [{periodo: 'AAAA-MM' | 'P<AAAA-MM-DD>', posto, indicador, valor ('' = apagar), substitui, justificativa}].
 * Linha manual: o valor do posto no período. Linha automática: só como SUBSTITUIÇÃO do apurado pelo e-GDV (substitui = 1) com
 * justificativa (meses anteriores ao e-GDV ou correção). Uma linha por célula (id = periodo|posto|indicador); só regrava o que mudou.
 * origem = 'manual' ou 'planilha' (importação da planilha de controle).
 */
function vigGravar_(s, itens, origem, arquivo) {
  const cfg = vigConfig_(), ids = {};
  cfg.postos.forEach(function (p) { ids[p.id] = p; });
  const agora = Date.now(), vistos = {};
  const linhas = itens.map(function (l, i) {
    const rot = 'Linha ' + (i + 1);
    if (!l || typeof l !== 'object') throw new Error(rot + ': lançamento inválido.');
    const per = String(l.periodo || ''), posto = String(l.posto || ''), ind = String(l.indicador || '');
    if (VIG_RE_MES.test(per)) { /* mês */ }
    else if (VIG_RE_PER.test(per)) { if (!diaValido_(per.slice(1)) || vigPeriodo_(cfg, per.slice(1)) !== per.slice(1)) throw new Error(rot + ': o período ' + per.slice(1) + ' não começa na escala de 10 dias (âncora ' + cfg.ancora + ', ciclo de ' + cfg.ciclo + ' dias).'); }
    else throw new Error(rot + ': período inválido (AAAA-MM ou P<data de início>).');
    if (!ids[posto]) throw new Error(rot + ': posto do VIGIFITO inexistente: ' + posto + '.');
    if (!VIG_IND[ind]) throw new Error(rot + ': indicador inexistente: ' + ind + '.');
    const id = per + '|' + posto + '|' + ind;
    if (vistos[id]) throw new Error(rot + ': lançamento repetido no envio (' + id + ').');
    vistos[id] = 1;
    const ano = Number(per.charAt(0) === 'P' ? per.slice(1, 5) : per.slice(0, 4));
    const o = { id: id, ano: ano, periodo: per, posto: posto, indicador: ind, valor: '', substitui: 0, justificativa: '', origem: origem, arquivo: arquivo || '',
                usuario: s.nome, admId: s.admId, atualizadoEm: agora, excluido: 0 };
    const rotI = rot + ' (' + ids[posto].nome + ', ' + ind + ')';
    if (l.valor === '' || l.valor === null || l.valor === undefined) { o.excluido = 1; return o; }
    o.valor = vigValor_(ind, l.valor, rotI);
    if (VIG_IND[ind][1] === 'auto') {
      o.substitui = 1;
      o.justificativa = convTexto_(l.justificativa || (origem === 'planilha' ? 'Importado da planilha de controle VIGIFITO (' + (arquivo || 'arquivo') + ')' : ''), 300, rotI + ': justificativa');
      if (o.justificativa.length < 5) throw new Error(rotI + ': linha apurada pelo e-GDV — o valor manual SUBSTITUI o automático e exige justificativa.');
    } else o.justificativa = convTexto_(l.justificativa, 300, rotI + ': observação');
    return o;
  });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const t = lerTudo_('VigLancamentos'), cols = t.cols, idx = {}, novas = [], hist = [];
    t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });
    const res = { ok: true, novos: 0, atualizados: 0, iguais: 0, excluidos: 0 };
    linhas.forEach(function (o) {
      const i = idx[o.id], ant = i === undefined ? null : paraObjeto_(cols, t.valores[i]), vivo = ant && ant.excluido !== 1;
      if (o.excluido) {
        if (!vivo) return;
        ant.excluido = 1; ant.usuario = o.usuario; ant.admId = o.admId; ant.atualizadoEm = agora;
        t.sh.getRange(i + 2, 1, 1, cols.length).setValues([cols.map(function (c) { return ant[c]; })]);
        hist.push([o.id, ant.valor, '']); res.excluidos++; return;
      }
      if (vivo && numOuNulo_(ant.valor) === o.valor && ant.substitui === o.substitui && ant.justificativa === o.justificativa) { res.iguais++; return; }
      const linha = cols.map(function (c) { return o[c]; });
      if (i === undefined) { novas.push(linha); idx[o.id] = -1; res.novos++; }
      else if (i < 0) return;
      else { t.sh.getRange(i + 2, 1, 1, cols.length).setValues([linha]); res.atualizados++; }
      hist.push([o.id, vivo ? ant.valor : '', o.valor + (o.substitui ? ' (substitui o e-GDV: ' + o.justificativa + ')' : '')]);
    });
    if (novas.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
    admHistLote_(s, origem === 'planilha' ? 'importar' : 'gravar', 'VigLancamentos', origem === 'planilha'
      ? [['arquivo: ' + arquivo, '', { novos: res.novos, atualizados: res.atualizados, iguais: res.iguais }]] : hist);
    return res;
  } finally { lock.releaseLock(); }
}
function admVigLancar_(s, req) {
  const l = Array.isArray(req.lancamentos) ? req.lancamentos : [];
  if (!l.length) throw new Error('Nada a gravar.');
  if (l.length > 2000) throw new Error('No máximo 2.000 valores por envio.');
  return vigGravar_(s, l, 'manual', '');
}
/** Importação da planilha de controle VIGIFITO (lida no navegador; até 1.500 valores por chamada; idempotente pelo id da célula). */
function admVigImportar_(s, req) {
  const l = Array.isArray(req.itens) ? req.itens : [];
  if (!l.length) throw new Error('Nada a importar.');
  if (l.length > 1500) throw new Error('No máximo 1.500 valores por envio.');
  return vigGravar_(s, l, 'planilha', convTexto_(req.arquivo, 200, 'Arquivo'));
}
/** Painel: edita a lista de postos do VIGIFITO (correspondência posto → BVA/município do e-GDV, tipo) e a escala dos períodos de 10 dias. */
function painelVigConfigSalvar(token, req) {
  const admin = adminDoToken_(token), c = req && req.config;
  if (!c || typeof c !== 'object') throw new Error('Configuração inválida.');
  const ancora = String(c.ancora || ''), ciclo = Number(c.ciclo);
  if (!diaValido_(ancora)) throw new Error('Data-âncora da escala inválida (aaaa-mm-dd).');
  if (!(ciclo >= 1 && ciclo <= 31) || Math.round(ciclo) !== ciclo) throw new Error('Ciclo da escala: de 1 a 31 dias.');
  if (!Array.isArray(c.postos) || !c.postos.length || c.postos.length > 40) throw new Error('Postos: de 1 a 40.');
  const vistos = {};
  const postos = c.postos.map(function (p, i) {
    const id = String((p && p.id) || '').trim();
    if (!/^[a-z0-9-]{1,40}$/.test(id) || vistos[id]) throw new Error('Posto ' + (i + 1) + ': id inválido ou repetido (letras minúsculas, números e hífen).');
    vistos[id] = 1;
    const nome = convTexto_(p.nome, 80, 'Nome do posto'); if (!nome) throw new Error('Posto ' + id + ' sem nome.');
    if (p.tipo !== 'fixa' && p.tipo !== 'volante') throw new Error('Posto ' + id + ': tipo fixa ou volante.');
    const locais = (Array.isArray(p.locais) ? p.locais : String(p.locais || '').split(/[\n;]/)).map(function (x) { return convTexto_(x, 80, 'Local'); }).filter(Boolean).slice(0, 10);
    return { id: id, nome: nome, municipio: convTexto_(p.municipio, 60, 'Município'), tipo: p.tipo, locais: locais };
  });
  const atual = vigConfig_(), o = { ancora: ancora, ciclo: ciclo, postos: postos, versao: (Number(atual.versao) || 0) + 1, atualizadoEm: Date.now(), atualizadoPor: admin };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { convGravar_('VigConfig', { id: 'vigifito', config: JSON.stringify(o), atualizadoEm: o.atualizadoEm, atualizadoPor: admin }); }
  finally { lock.releaseLock(); }
  return { ok: true, config: o };
}

/* ---------- Portal do Administrativo (web/administrativo/; login com Google ou código de ativação) ----------
 * O Administrativo da GDV (3 pessoas) lança no portal os dados que não vêm do app de campo: desembolso e execução física do convênio
 * (e a importação da planilha de movimentação), as linhas manuais dos relatórios (quadro PCE, colunas por município, CFO/CFOC, PTV,
 * educação sanitária, armadilhas do HLB) e o VIGIFITO por posto × mês (com a importação da planilha de controle). O painel do
 * gerente só mostra os dados e gera os relatórios: as actions painel* de gravação desses dados recusam (MSG_PORTAL).
 * Login: o navegador obtém o ID token do Google (Google Identity Services) e chama admLogin {idToken}; o servidor confere o token no
 * tokeninfo do Google (aud = propriedade GOOGLE_CLIENT_ID, iss, exp, email_verified), o e-mail (minúsculas) na lista de liberados (aba
 * Administrativo, gerida no painel → Servidores) e devolve um token de SESSÃO do portal (aleatório; na planilha só o SHA-256), válido
 * por 12 h e renovado ao usar. Sem Google configurado: código de 6 dígitos gerado no painel (admCodigo {codigo}) → a mesma sessão;
 * o código é permanente (serve para entrar de novo quando a sessão vence) até o gerente gerar outro ou revogar o acesso.
 * A sessão do portal não vale no painel nem no app (e as credenciais deles não valem aqui). O ID token nunca é gravado nem registrado.
 * Revogar no painel (ativo = 0) derruba a sessão na próxima chamada. Logins recusados: 10 em 15 min bloqueiam (CacheService).
 * LGPD: os e-mails ficam só na aba Administrativo (e no painel do administrador); lançamentos e histórico guardam o nome e o admId.
 */
const ADM_SESSAO_MS = 12 * 3600 * 1000;
const ADM_MAX_PADRAO = 10;                                    // liberados ativos (propriedade do script ADM_MAX troca)
const ADM_MAX_FALHAS = 10;                                    // logins recusados (Google ou código) antes de bloquear 15 min
const ADM_ISS = ['accounts.google.com', 'https://accounts.google.com'];
const MSG_PORTAL = 'Lançamentos são feitos no Portal do Administrativo (no painel, só leitura).';
const ADM_URL_PADRAO = 'https://evilasionogueiraagro-netizen.github.io/GDV/administrativo/';

function emailNorm_(v) { return String(v || '').trim().toLowerCase(); }
/** SHA-256 em hex (64 caracteres). */
function hexSha_(txt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(txt), Utilities.Charset.UTF_8)
    .map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
function admMax_() { const v = Number(PropertiesService.getScriptProperties().getProperty('ADM_MAX')); return v >= 1 && v <= 50 ? Math.round(v) : ADM_MAX_PADRAO; }
function admUrl_() { return PropertiesService.getScriptProperties().getProperty('ADM_URL') || ADM_URL_PADRAO; }
function admGoogleId_() { return String(PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '').trim(); }
/** Conta um login recusado (bloqueio de 15 min depois de ADM_MAX_FALHAS) e lança o erro. */
function admFalhou_(msg) {
  const c = CacheService.getScriptCache();
  c.put('falhas_adm', String(Number(c.get('falhas_adm') || 0) + 1), 900);
  throw new Error(msg);
}
function admBloqueado_() {
  if (Number(CacheService.getScriptCache().get('falhas_adm') || 0) >= ADM_MAX_FALHAS) throw new Error('Muitas tentativas recusadas. Aguarde 15 minutos e tente de novo.');
}

/** Login com Google: confere o ID token no tokeninfo do Google e o e-mail na lista de liberados. */
function admLogin_(req) {
  admBloqueado_();
  const tok = String(req.idToken || '');
  if (tok.length < 20 || tok.length > 4096 || !/^[A-Za-z0-9._-]+$/.test(tok)) admFalhou_('Login do Google inválido. Entre de novo.');
  const clientId = admGoogleId_();
  if (!clientId) throw new Error('O login com Google ainda não foi configurado no servidor (propriedade GOOGLE_CLIENT_ID). Use o código de ativação.');
  let info = null, code = 0;
  try {
    const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok), { muteHttpExceptions: true });
    code = r.getResponseCode();
    if (code === 200) info = JSON.parse(r.getContentText());
  } catch (e) { throw new Error('Não foi possível conferir o login com o Google agora. Tente de novo em instantes.'); }
  if (!info || typeof info !== 'object') admFalhou_('Login do Google inválido ou expirado. Entre de novo.');
  if (String(info.aud || '') !== clientId) admFalhou_('Login do Google emitido para outro aplicativo (Client ID diferente).');
  if (ADM_ISS.indexOf(String(info.iss || '')) < 0) admFalhou_('Login do Google inválido (emissor desconhecido).');
  if (!(Number(info.exp) * 1000 > Date.now())) admFalhou_('Login do Google expirado. Entre de novo.');
  if (!(info.email_verified === true || info.email_verified === 'true')) admFalhou_('E-mail da conta Google não verificado.');
  const email = emailNorm_(info.email);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const a = lerLeitura_('Administrativo').filter(function (x) { return x.id && x.ativo === 1 && emailNorm_(x.email) === email; })[0];
    if (!a) admFalhou_('A conta ' + email + ' não está liberada para o Portal do Administrativo. Peça ao gerente para liberar o e-mail no painel (aba Servidores).');
    return admNovaSessao_(a, 'google');
  } finally { lock.releaseLock(); }
}

/** Login por código de 6 dígitos (gerado no painel para um liberado). Permanente: vale em todo login até o gerente gerar outro
 * código para a pessoa ou revogar o acesso (as colunas codigoExpira antigas são ignoradas). */
function admCodigo_(req) {
  admBloqueado_();
  const cod = String(req.codigo || '').replace(/\D/g, '');
  if (cod.length !== 6) admFalhou_('O código tem 6 dígitos.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const t = lerTudo_('Administrativo'), agora = Date.now();
    for (let i = 0; i < t.valores.length; i++) {
      const a = paraObjeto_(t.cols, t.valores[i]);
      if (!a.id || !a.codigo || a.codigo.padStart(6, '0') !== cod) continue;
      if (a.ativo !== 1) admFalhou_('Este acesso foi revogado pelo gerente.');
      return admNovaSessao_(a, 'codigo');
    }
    admFalhou_('Código incorreto ou substituído por um novo. Confira com o gerente.');
  } finally { lock.releaseLock(); }
}

/** Nova sessão do portal (o chamador segura o lock): token aleatório devolvido uma vez; na planilha, só o SHA-256. */
function admNovaSessao_(a, origem) {
  const tok = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase(), agora = Date.now();
  const s = { id: Utilities.getUuid(), hash: hexSha_(tok), admId: a.id, origem: origem, criadoEm: agora, expiraEm: agora + ADM_SESSAO_MS, ultimoUso: agora, revogado: 0 };
  const sh = aba_('AdmSessoes'), cols = TABELAS.AdmSessoes;
  sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setValues([cols.map(function (c) { return s[c]; })]);
  admMarcarAcesso_(a.id, agora);
  return { ok: true, sessao: tok, nome: a.nome, email: emailNorm_(a.email), expiraEm: s.expiraEm, origem: origem };
}
function admMarcarAcesso_(id, agora) {
  const t = lerTudo_('Administrativo'), iu = t.cols.indexOf('ultimoAcesso');
  for (let i = 0; i < t.valores.length; i++) if (String(t.valores[i][0]) === String(id)) { t.sh.getRange(i + 2, iu + 1).setValue(agora); return; }
}

/** Valida o token de sessão do portal; renova a validade (12 h a partir do uso). Liberado revogado = sessão recusada. */
function admSessao_(tok) {
  tok = String(tok || '');
  if (!/^[0-9a-f]{64}$/.test(tok)) throw new Error('Sessão do portal inválida. Entre de novo.');
  const h = hexSha_(tok), t = lerTudo_('AdmSessoes'), agora = Date.now(), ih = t.cols.indexOf('hash');
  for (let i = t.valores.length - 1; i >= 0; i--) {
    if (String(t.valores[i][ih]) !== h) continue;
    const s = paraObjeto_(t.cols, t.valores[i]);
    if (s.revogado === 1) break;
    if (s.expiraEm <= agora) throw new Error('Sessão do portal expirada (12 h sem uso). Entre de novo.');
    const a = lerLeitura_('Administrativo').filter(function (x) { return x.id === s.admId; })[0];
    if (!a || a.ativo !== 1) throw new Error('Sessão do portal revogada: o acesso foi retirado pelo gerente.');
    if (s.expiraEm - agora < ADM_SESSAO_MS - 5 * 60 * 1000) {                 // renova (no máximo uma escrita a cada 5 min)
      s.expiraEm = agora + ADM_SESSAO_MS; s.ultimoUso = agora;
      t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return s[c]; })]);
      admMarcarAcesso_(a.id, agora);
    }
    return { admId: a.id, nome: a.nome, email: emailNorm_(a.email), expiraEm: s.expiraEm };
  }
  throw new Error('Sessão do portal encerrada. Entre de novo.');
}

/** Sair: a sessão é revogada no servidor (cópias do token deixam de valer). */
function admSair_(s, req) {
  const h = hexSha_(String(req.sessao || '')), t = lerTudo_('AdmSessoes'), ih = t.cols.indexOf('hash'), ir = t.cols.indexOf('revogado');
  for (let i = 0; i < t.valores.length; i++) if (String(t.valores[i][ih]) === h) t.sh.getRange(i + 2, ir + 1).setValue(1);
  return { ok: true };
}

/** Histórico de alterações feitas no portal: [registro, antes, depois] por linha (JSON limitado). */
function admHistLote_(s, acao, aba, itens) {
  if (!itens || !itens.length) return;
  const lim = function (o) {
    if (o === null || o === undefined || o === '') return '';
    const j = typeof o === 'string' ? o : JSON.stringify(o);
    return (j.length > 3000 ? j.slice(0, 2990) + '…' : j).replace(/^[=+\-@]/, "'$&");
  };
  const sh = aba_('AdmHistorico'), cols = TABELAS.AdmHistorico, agora = Date.now();
  const linhas = itens.map(function (x) {
    const o = { em: agora, admId: s.admId, nome: s.nome, acao: acao, aba: aba, registro: String(x[0] || '').slice(0, 200), antes: lim(x[1]), depois: lim(x[2]) };
    return cols.map(function (c) { return o[c]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, linhas.length, cols.length).setValues(linhas);
}

/** Servidores cadastrados (aba Fiscais, sem administradores) para o desembolso de diárias: id estável (hash do nome) e nome. */
function admServidores_() {
  const vistos = {}, out = [];
  lerLeitura_('Fiscais').forEach(function (f) {
    if (!f.nome || f.perfil === 'admin') return;
    const k = nomeChave_(f.nome); if (vistos[k]) return;
    vistos[k] = 1; out.push({ id: 'srv-' + hexSha_('srv:' + k).slice(0, 12), nome: f.nome });
  });
  return out.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/** Nomes de servidores já usados em diárias (para o autopreenchimento do portal): o nome mais recente de cada pessoa. */
function admServidoresDiaria_() {
  const por = {};
  lerLeitura_('ConvFinanceiro').forEach(function (r) {
    if (!r.id || r.excluido === 1 || !r.servidorNome) return;
    const k = nomeChave_(r.servidorNome), t = Number(r.atualizadoEm) || 0;
    if (!por[k] || t >= por[k].t) por[k] = { id: 'srv-' + hexSha_('srv:' + k).slice(0, 12), nome: String(r.servidorNome), t: t };
  });
  return Object.keys(por).map(function (k) { return { id: por[k].id, nome: por[k].nome }; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/* ----- actions do portal (todas exigem a sessão) ----- */
const autorAdm_ = function (s) { return { nome: s.nome, admId: s.admId }; };
function admDados_(s) {
  const vivo = function (r) { return r.id && r.excluido !== 1; };
  return { ok: true, nome: s.nome, email: s.email, expiraEm: s.expiraEm, hoje: hojeManaus_(), painelUrl: painelUrl_(),
           convenios: convListar_(), servidores: admServidoresDiaria_(),
           lancamentos: lerLeitura_('ConvLancamentos').filter(vivo).map(convLancOut_),
           financeiro: lerLeitura_('ConvFinanceiro').filter(vivo).map(convFinOutAdm_) };
}
function admConvLancar_(s, req) {
  const r = convLancar_(autorAdm_(s), req.lancamento);
  admHistLote_(s, r.antes ? 'editar' : 'lançar', 'ConvLancamentos', [[r.lancamento.id, r.antes, r.lancamento]]);
  if (r.financeiro) admHistLote_(s, r.finAntes ? 'editar' : 'lançar', 'ConvFinanceiro', [[r.financeiro.id, r.finAntes, r.financeiro]]);
  delete r.antes; delete r.finAntes; return r;
}
function admConvFinLancar_(s, req) {
  const r = convFinLancar_(autorAdm_(s), req.lancamento);
  admHistLote_(s, r.antes ? 'editar' : 'lançar', 'ConvFinanceiro', [[r.lancamento.id, r.antes, r.lancamento]]);
  delete r.antes; return r;
}
function admConvExcluir_(s, req) {
  const r = convExcluir_(autorAdm_(s), 'ConvLancamentos', req.id);
  admHistLote_(s, 'excluir', 'ConvLancamentos', [[r.id, r.antes, { excluido: 1 }]]);
  // bem: sem outro lançamento "adquirido"/"entregue" desse bem, o desembolso da aquisição também sai do Financeiro
  const a = r.antes;
  if (a.tipo === 'bem' && (a.situacao === 'adquirido' || a.situacao === 'entregue')) {
    const resta = lerLeitura_('ConvLancamentos').some(function (x) { return x.id && x.excluido !== 1 && x.convenio === a.convenio && x.tipo === 'bem' && x.submeta === a.submeta && (x.situacao === 'adquirido' || x.situacao === 'entregue'); });
    const f = resta ? null : lerLeitura_('ConvFinanceiro').filter(function (x) { return x.id && x.excluido !== 1 && x.chave === convChaveBem_(convDe_(a.convenio), a.submeta); })[0];
    if (f) { const rf = convExcluir_(autorAdm_(s), 'ConvFinanceiro', f.id); admHistLote_(s, 'excluir', 'ConvFinanceiro', [[rf.id, rf.antes, { excluido: 1 }]]); r.finExcluido = rf.id; }
  }
  delete r.antes; return r;
}
function admConvFinExcluir_(s, req) {
  const r = convExcluir_(autorAdm_(s), 'ConvFinanceiro', req.id);
  admHistLote_(s, 'excluir', 'ConvFinanceiro', [[r.id, r.antes, { excluido: 1 }]]); delete r.antes; return r;
}
function admConvFinImportar_(s, req) {
  const r = convFinImportar_(autorAdm_(s), req);
  admHistLote_(s, 'importar', 'ConvFinanceiro', [['arquivo: ' + r.arquivo, '', { novos: r.novos, atualizados: r.atualizados, iguais: r.iguais, excluidos: r.excluidos }]]);
  return r;
}
/** Lançamentos manuais do Relatório GDV no ano (com quem/quando), para o portal. */
function admRelDados_(s, req) {
  const ano = req.ano ? anoRelGdv_(req.ano) : Number(hojeManaus_().slice(0, 4));
  return { ok: true, ano: ano, hoje: hojeManaus_(),
    lancamentos: lerLeitura_('RelGdvLancamentos').filter(function (r) { return r.id && r.ano === ano; }).map(function (r) {
      return { mes: r.mes, chave: r.chave, valor: numOuNulo_(r.valor), lista: r.lista ? lerJSONSeguro_(r.lista, []) : null, usuario: r.usuario, atualizadoEm: r.atualizadoEm }; }) };
}
function admRelLancar_(s, req) { return relGdvLancar_(s, req); }
/** Histórico (últimas 300 alterações; filtro opcional por aba/registro). */
function admHistorico_(s, req) {
  const aba = String(req.aba || ''), reg = String(req.registro || '');
  const l = lerLeitura_('AdmHistorico').filter(function (h) { return h.em && (!aba || h.aba === aba) && (!reg || h.registro === reg); });
  return { ok: true, historico: l.slice(-300).reverse().map(function (h) { return { em: h.em, nome: h.nome, acao: h.acao, aba: h.aba, registro: h.registro, antes: h.antes, depois: h.depois }; }) };
}

const ADM_ACOES_ = {
  admSair: admSair_, admDados: admDados_, admConvLancar: admConvLancar_, admConvExcluir: admConvExcluir_, admConvFinLancar: admConvFinLancar_,
  admConvFinExcluir: admConvFinExcluir_, admConvFinImportar: admConvFinImportar_, admRelDados: admRelDados_, admRelLancar: admRelLancar_,
  admHistorico: admHistorico_, admVigDados: admVigDados_, admVigLancar: admVigLancar_, admVigImportar: admVigImportar_
};
/** Roteador das actions do portal: sessão obrigatória (o token do painel/app não vale aqui). */
function admAcao_(req) {
  const fn = ADM_ACOES_[req.action];
  if (!fn) throw new Error('Ação inválida.');
  return fn(admSessao_(req.sessao), req);
}

/* ----- painel → aba Servidores: lista de liberados do Administrativo (só administrador do painel) ----- */
function admLinhaOut_(a, agora) {
  const pend = !!a.codigo;                                                   // código permanente (até gerar outro ou revogar)
  return { id: a.id, email: emailNorm_(a.email), nome: a.nome, ativo: a.ativo === 1 ? 1 : 0, criadoEm: a.criadoEm, criadoPor: a.criadoPor, ultimoAcesso: a.ultimoAcesso || 0,
           codigo: pend ? a.codigo.padStart(6, '0') : '', codigoExpira: 0, atualizadoEm: a.atualizadoEm, atualizadoPor: a.atualizadoPor };
}
function painelAdmLista(token) {
  adminDoToken_(token);
  const agora = Date.now();
  return { ok: true, max: admMax_(), google: !!admGoogleId_(), url: admUrl_(),
           liberados: lerLeitura_('Administrativo').filter(function (a) { return a.id; }).map(function (a) { return admLinhaOut_(a, agora); }) };
}
/** Inclui/edita um liberado (e-mail Google, nome, ativo). ativo = 0 revoga: a sessão cai na próxima chamada do portal. */
function painelAdmSalvar(token, req) {
  const admin = adminDoToken_(token);
  req = req || {};
  const email = emailNorm_(req.email);
  if (!RE_EMAIL_.test(email) || email.length > 120) throw new Error('E-mail inválido.');
  const nome = nomeServidor_(req.nome), ativo = req.ativo === 0 || req.ativo === false || req.ativo === '0' ? 0 : 1;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = lerTudo_('Administrativo'), agora = Date.now(), id = String(req.id || '');
    let pos = -1, outros = 0;
    t.valores.forEach(function (l, i) {
      const a = paraObjeto_(t.cols, l); if (!a.id) return;
      if (id ? a.id === id : emailNorm_(a.email) === email) pos = i;
      else { if (emailNorm_(a.email) === email) throw new Error('Este e-mail já está na lista.'); if (a.ativo === 1) outros++; }
    });
    if (id && pos < 0) throw new Error('Liberado não encontrado.');
    if (ativo && outros >= admMax_()) throw new Error('Limite de ' + admMax_() + ' pessoas liberadas no Portal do Administrativo. Revogue alguém antes.');
    const a = pos >= 0 ? paraObjeto_(t.cols, t.valores[pos]) : { id: Utilities.getUuid(), criadoEm: agora, criadoPor: admin, ultimoAcesso: 0, codigo: '', codigoExpira: 0 };
    a.email = email; a.nome = nome; a.ativo = ativo; a.atualizadoEm = agora; a.atualizadoPor = admin;
    if (!ativo) { a.codigo = ''; a.codigoExpira = 0; }
    const linha = t.cols.map(function (c) { const v = a[c]; return v === null || v === undefined ? '' : v; });
    if (pos >= 0) t.sh.getRange(pos + 2, 1, 1, t.cols.length).setValues([linha]);
    else t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues([linha]);
    if (!ativo) {                                                                  // revogado: sessões abertas também saem
      const ss = lerTudo_('AdmSessoes'), ia = ss.cols.indexOf('admId'), ir = ss.cols.indexOf('revogado');
      ss.valores.forEach(function (l, i) { if (String(l[ia]) === a.id && Number(l[ir]) !== 1) ss.sh.getRange(i + 2, ir + 1).setValue(1); });
    }
    return { ok: true, liberado: admLinhaOut_(a, agora) };
  } finally { lock.releaseLock(); }
}
/** Código de ativação do portal (6 dígitos, permanente: vale até gerar outro ou revogar) para um liberado ativo — alternativa ao login com Google. */
function painelAdmCodigo(token, req) {
  const admin = adminDoToken_(token);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = lerTudo_('Administrativo'), agora = Date.now(), id = String((req && req.id) || ''), emUso = {};
    let pos = -1;
    t.valores.forEach(function (l, i) { const a = paraObjeto_(t.cols, l); if (a.codigo) emUso[a.codigo.padStart(6, '0')] = 1; if (a.id && a.id === id) pos = i; });
    if (pos < 0) throw new Error('Liberado não encontrado.');
    const a = paraObjeto_(t.cols, t.valores[pos]);
    if (a.ativo !== 1) throw new Error('Acesso revogado: reative antes de gerar o código.');
    let codigo;
    do { codigo = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0'); } while (emUso[codigo]);
    a.codigo = codigo; a.codigoExpira = 0; a.atualizadoEm = agora; a.atualizadoPor = admin;
    t.sh.getRange(pos + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return a[c]; })]);
    return { ok: true, id: a.id, nome: a.nome, codigo: codigo, expiraEm: 0, permanente: true, url: admUrl_() };
  } finally { lock.releaseLock(); }
}

/* ---------- Dashboard público (web/dashboard/, sem credencial) ----------
 * publicoDados {periodo, previa?, key?}: SÓ AGREGADOS dos blocos que o gerente ligou no painel (aba "Dashboard público"),
 * nunca nomes, CPF/CNPJ, placas, propriedades, servidores, fotos nem coordenadas de levantamentos/propriedades.
 * Mapa: municípios do PCE pelo nome digitado no levantamento (contagens pequenas viram "<3" com a supressão ligada);
 * barreiras em células de 0,1° (~11 km, só para o navegador somar por município) ou pela unidade; BVAs fixas na média das
 * coordenadas de início dos turnos (3 casas); calor em células de 0,1° com contagem (células abaixo do limite somem com a
 * supressão). Volantes nunca aparecem como ponto. Configuração na propriedade PUBLICO_CONFIG (JSON); padrão: desligado.
 * Cache por (versão da configuração, período) por 5 min + cópia "velha" (6 h) servida quando o limitador global de
 * recálculos por minuto estoura. "Barreiras em andamento agora" (desligado por padrão): só BVAs fixas, cache de 1 min. */
const PUBLICO_URL_PADRAO = 'https://evilasionogueiraagro-netizen.github.io/GDV/dashboard/';
const PUBLICO_CACHE_MS = 5 * 60 * 1000;        // números de um período ficam 5 min no CacheService
const PUBLICO_VIVO_MS = 60 * 1000;             // barreiras fixas em andamento: 1 min
const PUBLICO_VELHO_S = 6 * 3600;              // cópia servida quando o limitador estoura
const PUBLICO_MAX_RECALCULOS = 12;             // recálculos por minuto (todas as origens); acima disso, serve o cache
const PUBLICO_MIN_PEQUENO = 3;                 // supressão de números pequenos: 1 e 2 viram "<3"
const PUBLICO_GRADE = 10;                      // células de 1/10 de grau (≈ 11 km)
const PUBLICO_TITULO = 'Defesa Agropecuária em números';
const PUBLICO_TEXTO = 'Ações de educação sanitária, fiscalização do trânsito de vegetais e vigilância fitossanitária da ADAF no Amazonas, a partir dos registros do e-GDV.';
const PUBLICO_PERIODOS = { '30d': 'Últimos 30 dias', ano: 'Ano atual', anoAnterior: 'Ano anterior', tudo: 'Desde o início' };
const PUBLICO_PERIODOS_PADRAO = ['30d', 'ano', 'anoAnterior'];
// blocos (KPIs, gráficos e camadas) e o padrão de cada um
const PUBLICO_BLOCOS = {
  acoes: true, horas: true, veiculos: true, pessoas: true, porBarreira: true, tiposVeiculo: true,   // Barreiras
  tfs: true, procedimentos: true, autos: true, produtos: true,                                       // TF de Barreira
  levantamentos: true, municipios: true, deteccoes: true, amostras: true,                            // PCE
  mensal: true,                                                                                       // evolução no tempo
  coropletico: true, bvas: true, calor: false, aoVivo: false,                                         // mapa
  supressaoPequenos: true                                                                             // privacidade
};

function publicoUrl_() { return PropertiesService.getScriptProperties().getProperty('PUBLICO_URL') || PUBLICO_URL_PADRAO; }
function normPub_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function publicoPadrao_() {
  const b = {}; Object.keys(PUBLICO_BLOCOS).forEach(function (k) { b[k] = PUBLICO_BLOCOS[k]; });
  return { ativo: false, titulo: PUBLICO_TITULO, texto: PUBLICO_TEXTO, periodos: PUBLICO_PERIODOS_PADRAO.slice(), modos: { mapa: true, numeros: true },
           blocos: b, versao: 0, atualizadoPor: '', atualizadoEm: 0 };
}

/**
 * Aplica "o" (pedido do painel ou o JSON guardado) sobre "base". estrito = true (salvar pelo painel): chave desconhecida,
 * período desconhecido, nenhum período ou nenhum modo → erro. estrito = false (ler a propriedade): ignora o que não conhece.
 */
function publicoAplicar_(base, o, estrito) {
  const c = JSON.parse(JSON.stringify(base));
  if (!o || typeof o !== 'object') return c;
  const erro = function (m) { if (estrito) throw new Error(m); };
  if ('ativo' in o) c.ativo = o.ativo === true || o.ativo === 1 || o.ativo === '1';
  if ('titulo' in o) c.titulo = String(o.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 120) || PUBLICO_TITULO;
  if ('texto' in o) c.texto = String(o.texto || '').replace(/[ \t]+/g, ' ').trim().slice(0, 600);
  if ('periodos' in o) {
    const lst = Array.isArray(o.periodos) ? o.periodos.map(String) : [];
    lst.forEach(function (p) { if (!PUBLICO_PERIODOS.hasOwnProperty(p)) erro('Período desconhecido: ' + p + '.'); });
    const ok = Object.keys(PUBLICO_PERIODOS).filter(function (p) { return lst.indexOf(p) >= 0; });
    if (ok.length) c.periodos = ok; else erro('Libere pelo menos um período.');
  }
  if ('modos' in o && o.modos && typeof o.modos === 'object') {
    const m = { mapa: c.modos.mapa, numeros: c.modos.numeros };
    Object.keys(o.modos).forEach(function (k) { if (k !== 'mapa' && k !== 'numeros') return erro('Modo desconhecido: ' + k + '.'); m[k] = o.modos[k] === true || o.modos[k] === 1; });
    if (m.mapa || m.numeros) c.modos = m; else erro('Deixe pelo menos um modo (mapa ou números) ligado.');
  }
  if ('blocos' in o && o.blocos && typeof o.blocos === 'object') {
    Object.keys(o.blocos).forEach(function (k) {
      if (!PUBLICO_BLOCOS.hasOwnProperty(k)) return erro('Bloco desconhecido: ' + k + '.');
      c.blocos[k] = o.blocos[k] === true || o.blocos[k] === 1;
    });
  }
  return c;
}
function publicoConfig_() {
  const txt = PropertiesService.getScriptProperties().getProperty('PUBLICO_CONFIG');
  const o = lerJSONSeguro_(txt, null), c = publicoAplicar_(publicoPadrao_(), o, false);
  if (o && typeof o === 'object') { c.versao = Number(o.versao) || 0; c.atualizadoPor = String(o.atualizadoPor || ''); c.atualizadoEm = Number(o.atualizadoEm) || 0; }
  return c;
}

/** Painel → aba "Dashboard público": lê a configuração (só administrador). */
function painelPublicoConfig(token) {
  adminDoToken_(token);
  return { ok: true, config: publicoConfig_(), url: publicoUrl_(), padrao: publicoPadrao_(), periodos: PUBLICO_PERIODOS };
}
/** Painel → grava a configuração (valida as chaves; registra quem/quando; troca a versão = o cache público antigo deixa de valer). */
function painelPublicoSalvar(token, config) {
  const admin = adminDoToken_(token);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuração inválida.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const atual = publicoConfig_(), c = publicoAplicar_(atual, config, true);
    c.versao = (atual.versao || 0) + 1; c.atualizadoPor = admin; c.atualizadoEm = Date.now();
    PropertiesService.getScriptProperties().setProperty('PUBLICO_CONFIG', JSON.stringify(c));
    publicoLimparCache_(atual.versao);
    return { ok: true, config: c, url: publicoUrl_() };
  } finally { lock.releaseLock(); }
}
function publicoLimparCache_(versao) {
  const cache = CacheService.getScriptCache(), b = 'publico_' + versao + '_';
  Object.keys(PUBLICO_PERIODOS).forEach(function (p) { cache.remove(b + p); cache.remove(b + p + '_velho'); });
  cache.remove(b + 'vivo'); cache.remove(b + 'vivo_velho');
}

/** Período público (horário de Manaus). */
function publicoPeriodo_(chave) {
  const hoje = hojeManaus_(), ano = Number(hoje.slice(0, 4));
  let de = somarDias_(hoje, -29), ate = hoje;
  if (chave === 'ano') de = ano + '-01-01';
  else if (chave === 'anoAnterior') { de = (ano - 1) + '-01-01'; ate = (ano - 1) + '-12-31'; }
  else if (chave === 'tudo') de = '2000-01-01';
  const dias = Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 864e5) + 1;
  return { chave: chave, rotulo: PUBLICO_PERIODOS[chave], de: de, ate: ate, dias: dias };
}

/** Limitador global: no máximo PUBLICO_MAX_RECALCULOS recálculos por minuto (todas as origens). */
function publicoPodeRecalcular_(cache) {
  const k = 'publico_recalc_' + Math.floor(Date.now() / 60000), n = Number(cache.get(k) || 0);
  if (n >= PUBLICO_MAX_RECALCULOS) return false;
  cache.put(k, String(n + 1), 120);
  return true;
}
/** Valor do cache com validade própria ({em, dados}); vencido → recalcula se o limitador deixar, senão serve o último guardado. */
function publicoDoCache_(cache, chave, validadeMs, calcular) {
  const ler = function (k) { const v = cache.get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };
  const atual = ler(chave);
  if (atual && Date.now() - atual.em < validadeMs) return atual;
  if (!publicoPodeRecalcular_(cache)) {
    const velho = atual || ler(chave + '_velho');
    if (velho) { velho.limitado = true; return velho; }
    throw new Error('Muitos acessos ao mesmo tempo. Tente de novo em um minuto.');
  }
  const o = { em: Date.now(), dados: calcular() }, s = JSON.stringify(o);
  if (s.length < 95000) { cache.put(chave, s, Math.ceil(validadeMs / 1000) + 60); cache.put(chave + '_velho', s, PUBLICO_VELHO_S); }
  return o;
}

const ehFixa_ = function (t) { return normPub_(t.posto) === 'fixa'; };
const celulaPub_ = function (v) { return Math.round(v * PUBLICO_GRADE) / PUBLICO_GRADE; };
/** Coordenada de início do turno (ou a do fim, se faltar), como números; null sem coordenada. */
function coordTurnoPub_(t) {
  let la = numOuNulo_(t.latIni), lo = numOuNulo_(t.lngIni);
  if (la === null || lo === null) { la = numOuNulo_(t.latFim); lo = numOuNulo_(t.lngFim); }
  return la === null || lo === null || (la === 0 && lo === 0) ? null : [la, lo];
}
/** Ponto de cada BVA fixa: média das coordenadas de início de TODOS os turnos fixos daquele local (3 casas decimais ≈ 100 m). */
/** Nome público da BVA: turnos antigos com o local digitado à mão ("CEASA", "bva ceasa") somam com "BVA - CEASA". */
function nomeBvaPub_(local) {
  const l = String(local || '').trim().replace(/\s+/g, ' ');
  if (!l) return '';
  const base = l.toUpperCase().replace(/^BVA\b\s*[-–]?\s*/, '');
  return base ? 'BVA - ' + base : l;
}

function coordsBVA_(turnos) {
  const s = {};
  turnos.forEach(function (t) {
    const nome = nomeBvaPub_(t.local), c = coordTurnoPub_(t);
    if (!nome || !ehFixa_(t) || !c) return;
    const x = s[nome] = s[nome] || { la: 0, lo: 0, n: 0 }; x.la += c[0]; x.lo += c[1]; x.n++;
  });
  const out = {};
  Object.keys(s).forEach(function (k) { out[k] = [Math.round(s[k].la / s[k].n * 1000) / 1000, Math.round(s[k].lo / s[k].n * 1000) / 1000]; });
  return out;
}

/** Agregados do período (só os blocos ligados). */
function publicoCalcular_(cfg, per) {
  const B = cfg.blocos, de = per.de, ate = per.ate, agora = Date.now();
  const noPer = function (r) { return r.data >= de && r.data <= ate; };
  const lim = B.supressaoPequenos ? PUBLICO_MIN_PEQUENO : 0;
  const sup = function (n) { return lim && n > 0 && n < lim ? '<' + lim : n; };
  const passo = per.dias <= 31 ? 'dia' : 'mes', serie = {};
  let primeiro = '';
  const ponto = function (d) {
    if (!primeiro || d < primeiro) primeiro = d;
    const k = passo === 'dia' ? d : d.slice(0, 7);
    return serie[k] = serie[k] || { veiculos: 0, tfs: 0, levantamentos: 0 };
  };

  // ---- Barreiras ----
  const todosTurnos = lerLeitura_('Turnos').filter(function (t) { return t.id; });
  const turnoPorId = {}, locDe = {}, porLoc = {}, porBar = {}, volante = { local: 'Postos volantes', fixa: false, acoes: 0, veiculos: 0 };
  let acoes = 0, minutos = 0;
  const locKey = function (t) {
    const c = coordTurnoPub_(t);
    if (c) return 'c:' + celulaPub_(c[0]) + ',' + celulaPub_(c[1]);
    const u = String(t.unidade || '').trim().toUpperCase();
    return u ? 'u:' + u : '';
  };
  const loc = function (k) {
    if (!k) return null;
    if (!porLoc[k]) {
      const o = porLoc[k] = { acoes: 0, veiculos: 0, tfs: 0 };
      if (k.slice(0, 2) === 'c:') { const p = k.slice(2).split(','); o.lat = Number(p[0]); o.lon = Number(p[1]); } else o.unidade = k.slice(2);
    }
    return porLoc[k];
  };
  todosTurnos.forEach(function (t) {
    turnoPorId[t.id] = t; locDe[t.id] = locKey(t);
    if (!noPer(t)) return;
    t._per = true; acoes++;
    const ini = tsManaus_(t.data, t.inicio);
    if (ini !== null) {
      let f = t.encerrado === 1 ? (t.fim ? tsManaus_(t.data, t.fim) : null) : Math.min(agora, ini + TURNO_MAX_MS);
      if (f !== null && t.encerrado === 1 && f < ini) f += 864e5;
      if (f !== null && f > ini) minutos += Math.min(f - ini, 24 * 3600 * 1000) / 60000;
    }
    const l = loc(locDe[t.id]); if (l) l.acoes++;
    const nb = ehFixa_(t) ? nomeBvaPub_(t.local) : '';
    const b = nb ? (porBar[nb] = porBar[nb] || { local: nb, fixa: true, acoes: 0, veiculos: 0 }) : volante;
    b.acoes++; t._bar = b;
  });
  let veiculos = 0, pessoas = 0; const tipos = {};
  lerLeitura_('Veiculos').forEach(function (v) {
    const t = turnoPorId[v.turnoId];
    if (!v.id || v.excluido === 1 || !t || !t._per) return;
    veiculos++; pessoas += v.pessoas || 0;
    const tp = String(v.tipo || '').trim().toUpperCase().slice(0, 4) || 'OUTRO'; tipos[tp] = (tipos[tp] || 0) + 1;
    const l = loc(locDe[t.id]); if (l) l.veiculos++;
    t._bar.veiculos++;
    ponto(t.data).veiculos++;
  });

  // ---- TF de Barreira (válidos = não cancelados) ----
  const tfs = lerLeitura_('TFs').filter(function (r) { return r.id && r.cancelado !== 1 && noPer(r); });
  const proc = { liberacao: 0, apreensao: 0, rechaco: 0, outro: 0 }, prod = {};
  let autos = 0;
  tfs.forEach(function (r) {
    proc[proc.hasOwnProperty(r.procedimento) && r.procedimento !== 'outro' ? r.procedimento : 'outro']++;
    if (r.auto === 1) autos++;
    ponto(r.data).tfs++;
    const l = turnoPorId[r.turnoId] ? loc(locDe[r.turnoId]) : null; if (l) l.tfs++;
    if (r.procedimento !== 'apreensao') return;
    produtosTF_(r.produtos).forEach(function (p) {
      const nome = String(p.produto).toUpperCase().slice(0, 60), un = String(p.unidade || '').slice(0, 20), k = nome + '|' + un.toLowerCase();
      const x = prod[k] = prod[k] || { produto: nome, unidade: un, quantidade: 0, tfs: 0 };
      x.tfs++; if (p.quantidade !== null) x.quantidade += p.quantidade;
    });
  });

  // ---- PCE ----
  const levs = lerLeitura_('Levantamentos').filter(function (r) { return r.id && r.excluido !== 1 && noPer(r); });
  const porMun = {}, pragas = {}, calor = {};
  let det = 0, susp = 0, comDet = 0, amostras = 0;
  levs.forEach(function (r) {
    const cult = culturasLev_(r), d = cult.filter(function (c) { return c.praga; });
    ponto(r.data).levantamentos++;
    det += d.length; if (d.length) comDet++;
    d.forEach(function (c) {
      const p = pragas[c.praga] = pragas[c.praga] || { praga: String(c.praga).slice(0, 80), deteccoes: 0, suspeitas: 0, mun: {} };
      p.deteccoes++; if (c.resultado === 'suspeita') { p.suspeitas++; susp++; }
      if (r.municipio) p.mun[normPub_(r.municipio)] = true;
    });
    amostras += cult.filter(function (c) { return c.coleta === 'Sim'; }).length;
    const km = normPub_(r.municipio);
    if (km) { const m = porMun[km] = porMun[km] || { municipio: String(r.municipio).trim().slice(0, 60), levantamentos: 0, deteccoes: 0 }; m.levantamentos++; m.deteccoes += d.length; }
    const la = numOuNulo_(r.lat), lo = numOuNulo_(r.lon);
    if (d.length && la !== null && lo !== null) { const k = celulaPub_(la) + ',' + celulaPub_(lo); calor[k] = (calor[k] || 0) + d.length; }
  });
  const termos = (B.amostras ? lerLeitura_('Colheitas') : []).filter(function (r) { return r.id && r.excluido !== 1 && r.cancelado !== 1 && noPer(r); }).length;

  const out = {};
  if (cfg.modos.numeros) {
    const N = out.numeros = {};
    if (B.acoes) N.acoes = acoes;
    if (B.horas) N.horas = Math.round(minutos / 60);
    if (B.veiculos) N.veiculos = veiculos;
    if (B.pessoas) N.pessoas = pessoas;
    if (B.porBarreira) N.porBarreira = Object.keys(porBar).map(function (k) { return porBar[k]; }).sort(function (a, b) { return b.veiculos - a.veiculos || a.local.localeCompare(b.local); })
      .concat(volante.acoes ? [volante] : []).map(function (b) { return { local: b.local, fixa: b.fixa, acoes: B.acoes ? b.acoes : undefined, veiculos: B.veiculos ? b.veiculos : undefined }; });
    if (B.tiposVeiculo) N.tiposVeiculo = Object.keys(tipos).map(function (k) { return { tipo: k, n: tipos[k] }; }).sort(function (a, b) { return b.n - a.n; });
    if (B.tfs) N.tfs = tfs.length;
    if (B.procedimentos) N.procedimentos = proc;
    if (B.autos) N.autos = autos;
    if (B.produtos) N.produtos = Object.keys(prod).map(function (k) { const p = prod[k]; p.quantidade = Math.round(p.quantidade * 100) / 100; return p; })
      .sort(function (a, b) { return b.tfs - a.tfs || b.quantidade - a.quantidade; }).slice(0, 15);
    if (B.levantamentos) N.levantamentos = levs.length;
    if (B.municipios) { N.municipiosCobertos = Object.keys(porMun).length; N.municipiosTotal = 62; }
    if (B.deteccoes) {
      N.deteccoes = det; N.suspeitas = susp; N.levComDeteccao = comDet; N.levNegativos = levs.length - comDet;
      N.pragas = Object.keys(pragas).map(function (k) { const p = pragas[k]; return { praga: p.praga, deteccoes: p.deteccoes, suspeitas: p.suspeitas, municipios: Object.keys(p.mun).length }; })
        .sort(function (a, b) { return b.deteccoes - a.deteccoes || a.praga.localeCompare(b.praga); }).slice(0, 20);
    }
    if (B.amostras) { N.amostras = amostras; N.termos = termos; }
    const campos = ['veiculos', 'tfs', 'levantamentos'].filter(function (k) { return B[k]; });
    if (B.mensal && campos.length) {
      const pontos = [];
      let d = per.chave === 'tudo' && primeiro > de ? primeiro : de;            // "desde o início": a partir do primeiro registro
      if (passo === 'mes') d = d.slice(0, 7) + '-01';
      for (let i = 0; d <= ate && i < 800; i++) {
        const k = passo === 'dia' ? d : d.slice(0, 7), s = serie[k] || {}, p = { chave: k };
        campos.forEach(function (c) { p[c] = s[c] || 0; });
        pontos.push(p);
        if (passo === 'dia') d = somarDias_(d, 1);
        else { const a = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); d = (m === 12 ? (a + 1) + '-01' : a + '-' + String(m + 1).padStart(2, '0')) + '-01'; }
      }
      N.serie = { passo: passo, campos: campos, pontos: pontos };
    }
  }
  if (cfg.modos.mapa) {
    const M = out.mapa = {};
    if (B.coropletico && (B.levantamentos || B.deteccoes)) M.pce = Object.keys(porMun).map(function (k) {
      const m = porMun[k], o = { municipio: m.municipio };
      if (B.levantamentos) o.levantamentos = sup(m.levantamentos);
      if (B.deteccoes) o.deteccoes = sup(m.deteccoes);
      return o;
    });
    if (B.coropletico && (B.acoes || B.veiculos || B.tfs)) M.barreiras = Object.keys(porLoc).map(function (k) {
      const l = porLoc[k], o = l.unidade ? { unidade: l.unidade } : { lat: l.lat, lon: l.lon };
      if (B.acoes) o.acoes = l.acoes; if (B.veiculos) o.veiculos = l.veiculos; if (B.tfs) o.tfs = l.tfs;
      return o;
    });
    if (B.bvas) {
      const co = coordsBVA_(todosTurnos);
      M.bvas = Object.keys(co).sort().map(function (k) {
        const b = porBar[k] || { acoes: 0, veiculos: 0 }, o = { nome: k, lat: co[k][0], lon: co[k][1] };
        if (B.acoes) o.acoes = b.acoes; if (B.veiculos) o.veiculos = b.veiculos;
        return o;
      });
    }
    if (B.calor) M.calor = Object.keys(calor).filter(function (k) { return calor[k] >= (lim || 1); })
      .map(function (k) { const p = k.split(','); return [Number(p[0]), Number(p[1]), calor[k]]; });
  }
  return out;
}

/** BVAs fixas com turno aberto agora (início nas últimas 12 h): nome, quantos em andamento e o ponto da BVA. Volantes nunca. */
function publicoAoVivo_() {
  const agora = Date.now(), turnos = lerLeitura_('Turnos').filter(function (t) { return t.id; }), por = {};
  turnos.forEach(function (t) {
    if (t.encerrado === 1 || !ehFixa_(t)) return;
    const nome = nomeBvaPub_(t.local), ini = tsManaus_(t.data, t.inicio);
    if (!nome || ini === null || agora - ini > TURNO_MAX_MS || ini - agora > ENCERRAR_TOLERANCIA_MS) return;
    por[nome] = (por[nome] || 0) + 1;
  });
  const co = coordsBVA_(turnos);
  return Object.keys(por).sort().map(function (k) { const o = { nome: k, emAndamento: por[k] }; if (co[k]) { o.lat = co[k][0]; o.lon = co[k][1]; } return o; });
}

/**
 * publicoDados {periodo?, previa?, key?}: página pública (sem credencial). Desligado → {ok, ativo: false}.
 * previa = true com credencial de administrador: mostra a configuração salva mesmo com o dashboard desligado (pré-visualização do painel).
 */
function publicoDados_(req) {
  const cfg = publicoConfig_();
  const previa = req.previa === true;
  if (previa) adminDoToken_(req.key);
  if (!cfg.ativo && !previa) return { ok: true, ativo: false };
  const periodos = cfg.periodos.map(function (k) { return { chave: k, rotulo: PUBLICO_PERIODOS[k] }; });
  const chave = req.periodo ? String(req.periodo) : cfg.periodos[0];
  if (cfg.periodos.indexOf(chave) < 0) return { ok: false, erro: 'Este período não está disponível no dashboard. Escolha outro.', periodos: periodos };
  const cache = CacheService.getScriptCache(), base = 'publico_' + cfg.versao + '_';
  const per = publicoPeriodo_(chave);
  const c = publicoDoCache_(cache, base + chave, PUBLICO_CACHE_MS, function () { return publicoCalcular_(cfg, per); });
  const r = { ok: true, ativo: cfg.ativo, previa: previa, titulo: cfg.titulo, texto: cfg.texto, modos: cfg.modos, blocos: cfg.blocos,
              periodos: periodos, periodo: { chave: chave, rotulo: per.rotulo, de: per.de, ate: per.ate },
              atualizadoEm: c.em, agora: Date.now(), supressao: cfg.blocos.supressaoPequenos ? PUBLICO_MIN_PEQUENO : 0 };
  if (c.limitado) r.doCache = true;
  if (c.dados.numeros) r.numeros = c.dados.numeros;
  if (c.dados.mapa) r.mapa = c.dados.mapa;
  if (cfg.modos.mapa && cfg.blocos.aoVivo) {
    const v = publicoDoCache_(cache, base + 'vivo', PUBLICO_VIVO_MS, publicoAoVivo_);
    r.aoVivo = { em: v.em, locais: v.dados };
  }
  return r;
}

/* ---------- Segurança ---------- */

/** Valida a credencial e devolve o nome do usuário (fiscal ou "Administrador"). */
function autenticar_(key) {
  key = String(key || '');
  if (!key) throw new Error('Aparelho não ativado.');
  const mestra = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (mestra && key === mestra) return 'Administrador';
  const t = lerTudo_('Fiscais');
  for (let i = 0; i < t.valores.length; i++) {
    const f = paraObjeto_(t.cols, t.valores[i]);
    if (f.token && f.token === key && f.ativo === 1) return f.nome;
  }
  throw new Error('Acesso revogado ou inválido. Ative o aparelho novamente com um novo código.');
}

/** O aparelho troca o código de 6 dígitos por uma credencial própria (uso único). */
function ativar_(req) {
  const cache = CacheService.getScriptCache();
  // contadores separados: erros no painel (admin) não travam a ativação dos aparelhos dos fiscais, e vice-versa
  const chaveFalhas = req.perfil === 'admin' ? 'falhas_ativacao_admin' : 'falhas_ativacao';
  const limite = req.perfil === 'admin' ? MAX_FALHAS_ADMIN : MAX_FALHAS_ATIVACAO;
  const bloqueado = function () { return Number(cache.get(chaveFalhas) || 0) >= limite; };
  const msgBloqueio = 'Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.';
  if (bloqueado()) throw new Error(msgBloqueio);                  // recusa rápida, sem esperar o lock
  const cod = String(req.codigo || '').replace(/\D/g, '');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // releitura DENTRO do lock: requisições em paralelo não leem o mesmo contador (cada erro soma 1 de verdade)
    const falhas = Number(cache.get(chaveFalhas) || 0);
    if (falhas >= limite) throw new Error(msgBloqueio);
    const t = lerTudo_('Fiscais'), agora = Date.now();
    let achada = -1;
    if (cod.length === 6) {
      t.valores.forEach(function (l, i) {
        const f = paraObjeto_(t.cols, l);
        if (achada < 0 && f.ativo === 1 && !f.token && f.codigo !== '' && f.codigo.padStart(6, '0') === cod && f.expiraEm > agora &&
            (f.perfil === 'admin') === (req.perfil === 'admin')) achada = i;
      });
    }
    if (achada < 0) {
      let motivo = 'Código incorreto ou já usado. Gere um novo código no menu e-GDV da planilha.';
      if (cod.length !== 6) motivo = 'O código tem 6 dígitos.';
      else t.valores.forEach(function (l) {                        // explica o motivo quando o código existe, mas não pode ser usado aqui
        const f = paraObjeto_(t.cols, l);
        if (f.token || f.codigo === '' || f.codigo.padStart(6, '0') !== cod) return;
        if (f.ativo !== 1) motivo = 'Este código foi revogado. Gere um novo código.';
        else if ((f.perfil === 'admin') !== (req.perfil === 'admin')) {
          motivo = req.perfil === 'admin'
            ? 'Este é um código de FISCAL. Para o painel, gere o código em e-GDV → Gerar código de administrador (painel).'
            : 'Este é um código de ADMINISTRADOR (painel). Para o app dos fiscais, gere o código em e-GDV → Gerar código de ativação.';
        } else if (f.expiraEm <= agora) motivo = 'Código expirado. Gere um novo código.';
      });
      cache.put(chaveFalhas, String(falhas + 1), 900);
      throw new Error(motivo);
    }
    const f = paraObjeto_(t.cols, t.valores[achada]);
    f.token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    f.ativadoEm = agora;
    f.codigo = '';                                            // código de uso único
    t.sh.getRange(achada + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
    return { ok: true, nome: f.nome, token: f.token };
  } finally {
    lock.releaseLock();
  }
}

/** Cria uma autorização (linha em "Fiscais") e devolve o código de 6 dígitos. geradoPor: administrador do painel (padrão "planilha" = menu). */
function gerarCodigo_(nome, perfil, geradoPor) {
  nome = String(nome || '').trim().replace(/\s+/g, ' ');
  if (perfil !== 'admin' && nome.split(' ').length < 2) throw new Error('Informe o nome completo (nome e sobrenome).');
  if (!nome) throw new Error('Informe o nome.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'), agora = Date.now();
    const emUso = {};
    t.valores.forEach(function (l) {
      const f = paraObjeto_(t.cols, l);
      if (f.ativo === 1 && !f.token && f.codigo) emUso[f.codigo.padStart(6, '0')] = true;
    });
    let codigo;
    do {
      codigo = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0');
    } while (emUso[codigo]);
    const expiraEm = agora + VALIDADE_CODIGO_MS;
    const autor = String(geradoPor || 'planilha').replace(/^[=+\-@\s]+/, '').slice(0, 120) || 'planilha';   // texto, nunca fórmula
    const linha = { nome: nome, codigo: codigo, expiraEm: expiraEm, ativo: 1, token: '', ativadoEm: 0, perfil: perfil === 'admin' ? 'admin' : '', geradoPor: autor,
                    oculto: '', ocultoPor: '', ocultoEm: '' };                                  // linha nova nunca nasce "removida da lista"
    t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return linha[c]; })]);
    return { codigo: codigo, expiraEm: expiraEm, nome: nome, perfil: perfil === 'admin' ? 'admin' : 'fiscal' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Revoga todos os aparelhos/códigos com esse nome. Devolve quantos foram revogados.
 * perfil: 'fiscal' = só acessos de fiscal (painelRevogar), 'admin' = só de administrador (painelRevogarAdmin), vazio = todos (menu).
 */
function revogar_(nome, perfil) {
  nome = nomeChave_(nome);
  if (!nome) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'); let n = 0;
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if (nomeChave_(f.nome) === nome && f.ativo === 1 && (!perfil || (perfil === 'admin') === (f.perfil === 'admin'))) {
        f.ativo = 0;
        t.sh.getRange(i + 2, 1, 1, t.cols.length).setValues([t.cols.map(function (c) { return f[c]; })]);
        n++;
      }
    });
    return n;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Rotinas automáticas (gatilhos de tempo): turno esquecido, backup diário e relatório mensal ---------- */
// Ativadas uma vez pelo dono da planilha: menu e-GDV → Ativar rotinas automáticas (pede autorização para gatilhos, Drive e e-mail).
//   encerrarTurnosAutomatico  a cada 30 min   turno aberto há mais de 12 h é encerrado (encerradoPor = "Automático (12 h)")
//   backupDiario              todo dia ~03h   cópia da planilha em "GDV - Backups" (mantém as 30 mais recentes)
//   relatorioMensal           dia 1 ~07h      e-mail com os números do mês anterior (destinatários em RELATORIO_EMAILS)
//   arquivarAnosAntigos       todo dia ~04h   só age se houver linhas de anos anteriores ao ano passado (ver "Arquivamento anual")
// "Desativar rotinas automáticas" apaga os gatilhos e grava ROTINAS_DESATIVADAS = 1 (o painel também deixa de encerrar turnos).

const TURNO_MAX_MS = 12 * 3600 * 1000;             // plantão dura no máximo 12 h: aberto além disso = turno esquecido
const ENCERRADO_AUTO = 'Automático (12 h)';         // encerradoPor do encerramento automático (painel e app reconhecem o início "Automático")
const AUTO_INTERVALO_S = 600;                        // dentro do painelDados: no máximo 1 vez a cada 10 min
const BACKUP_PASTA = 'GDV - Backups', BACKUP_PREFIXO = 'GDV backup ', BACKUP_MANTER = 30;
const ROTINAS_ = [
  { fn: 'encerrarTurnosAutomatico', nome: 'Encerrar turnos esquecidos (a cada 30 min)',
    criar: function (b) { return b.timeBased().everyMinutes(30); } },
  { fn: 'backupDiario', nome: 'Backup diário (por volta das 03h)',
    criar: function (b) { return b.timeBased().everyDays(1).atHour(3).inTimezone('America/Manaus'); } },
  { fn: 'relatorioMensal', nome: 'Relatório mensal por e-mail (dia 1, por volta das 07h)',
    criar: function (b) { return b.timeBased().onMonthDay(1).atHour(7).inTimezone('America/Manaus'); } },
  { fn: 'arquivarAnosAntigos', nome: 'Arquivamento anual (verificação diária leve, por volta das 04h)',
    criar: function (b) { return b.timeBased().everyDays(1).atHour(4).inTimezone('America/Manaus'); } }
];

/** "HH:MM" no horário de Manaus (UTC−4, como tsManaus_). */
function hmManaus_(ms) { return new Date(ms - 4 * 3600 * 1000).toISOString().slice(11, 16); }
function rotinasDesativadas_() { return PropertiesService.getScriptProperties().getProperty('ROTINAS_DESATIVADAS') === '1'; }

/**
 * Encerra os turnos abertos (encerrado ≠ 1) cujo início (data + inicio, Manaus) foi há mais de 12 h. fim = o que o celular informou
 * (turno encerrado no aparelho que não chegou: aba Aparelhos → fimPendentes) ou o último registro do turno (maior entre o último
 * veículo, o último sinal do aparelho com o turno aberto e o início), nunca depois de início + 12 h. Grava encerradoPor = "Automático (12 h)",
 * encerradoEm e atualizadoEm/srv_ts = agora: o aparelho recebe o encerramento no próximo sync e não reabre o turno (ver gravar_).
 * Idempotente. Sem turno vencido, só lê a aba Turnos (sem lock).
 */
function encerrarTurnosAutomatico() {
  if (rotinasDesativadas_()) return { ok: true, encerrados: [], desativado: true };
  const agora = Date.now();
  const vencido = function (o) { const ini = tsManaus_(o.data, o.inicio); return !!o.id && o.encerrado !== 1 && ini !== null && agora - ini > TURNO_MAX_MS; };
  if (!lerLeitura_('Turnos').some(vencido)) return { ok: true, encerrados: [] };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Turnos'), cols = t.cols, alvo = {};
    t.valores.forEach(function (l, i) { const o = paraObjeto_(cols, l); if (vencido(o)) alvo[o.id] = { i: i, o: o, ini: tsManaus_(o.data, o.inicio), ult: 0 }; });
    if (!Object.keys(alvo).length) return { ok: true, encerrados: [] };
    lerLeitura_('Veiculos').forEach(function (v) {
      const a = alvo[v.turnoId];
      if (!a || v.excluido === 1) return;
      let ms = tsManaus_(a.o.data, v.hora);
      if (ms !== null && ms < a.ini) ms += 864e5;                                     // veículo depois da meia-noite
      if (ms !== null && ms > a.ult) a.ult = ms;
    });
    let aparelhos = [];
    try { aparelhos = lerAparelhos_(); } catch (e) { /* sem aba Aparelhos: usa só os veículos */ }
    const feitos = [];
    Object.keys(alvo).forEach(function (id) {
      const a = alvo[id], o = a.o;
      const aps = aparelhos.filter(function (ap) { return !ap.legado && ap.usuario === o.usuario; });
      const cel = aps.filter(function (ap) { return ap.turnosEncerradosPendentes.indexOf(id) >= 0 && RE_HM_.test(String(ap.fimPendentes[id] || '')); })
        .sort(function (x, y) { return y.ultimoSinal - x.ultimoSinal; })[0];
      let fim;
      if (cel) fim = String(cel.fimPendentes[id]);                                    // o fiscal encerrou no celular: vale o horário dele
      else {
        let ms = Math.max(a.ini, a.ult);
        aps.forEach(function (ap) { if (ap.turnoAtual === id && ap.ultimoSinal > ms) ms = ap.ultimoSinal; });
        fim = hmManaus_(Math.min(ms, a.ini + TURNO_MAX_MS));
      }
      const novo = { encerrado: 1, fim: fim, atualizadoEm: agora, srv_ts: agora, encerradoPor: ENCERRADO_AUTO, encerradoEm: agora };
      t.sh.getRange(a.i + 2, 1, 1, cols.length).setValues([cols.map(function (c, i) { return c in novo ? novo[c] : t.valores[a.i][i]; })]);
      feitos.push({ id: id, fim: fim, doCelular: !!cel });
    });
    return { ok: true, encerrados: feitos };
  } finally {
    lock.releaseLock();
  }
}

/** Chamado pelo painelDados: roda o encerramento automático no máximo 1 vez a cada 10 min (CacheService). Nunca derruba o painel. */
function encerrarTurnosAutomaticoBarato_() {
  try {
    const c = CacheService.getScriptCache();
    if (c.get('auto_encerrar')) return;
    c.put('auto_encerrar', '1', AUTO_INTERVALO_S);
    encerrarTurnosAutomatico();
  } catch (e) { /* trava ocupada ou aba com problema: tenta de novo na próxima vez */ }
}

/** Situação das rotinas para o painel (rodapé): último backup e última falha de backup (se mais recente). */
function situacaoRotinas_() {
  const props = PropertiesService.getScriptProperties();
  const b = lerJSONSeguro_(props.getProperty('ULTIMO_BACKUP'), null), e = lerJSONSeguro_(props.getProperty('ULTIMO_BACKUP_ERRO'), null);
  const em = b && Number(b.em) || null;
  const a = lerJSONSeguro_(props.getProperty('ULTIMO_ARQUIVAMENTO'), null);
  return { ultimoBackup: em, backupFalhou: e && Number(e.em) > (em || 0) ? Number(e.em) : null, desativadas: rotinasDesativadas_(),
           ultimoArquivamento: a && Number(a.em) || null };
}

/** Cria os gatilhos que faltam (não duplica; repetidos de uma mesma rotina são apagados). Devolve os nomes das rotinas ativas. */
function ativarRotinasAutomaticas_() {
  const vistos = {};
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    const fn = tr.getHandlerFunction();
    if (!ROTINAS_.some(function (r) { return r.fn === fn; })) return;
    if (vistos[fn]) ScriptApp.deleteTrigger(tr); else vistos[fn] = true;
  });
  const criadas = [];
  ROTINAS_.forEach(function (r) { if (!vistos[r.fn]) { r.criar(ScriptApp.newTrigger(r.fn)).create(); criadas.push(r.fn); } });
  PropertiesService.getScriptProperties().deleteProperty('ROTINAS_DESATIVADAS');
  return { criadas: criadas, ativas: ROTINAS_.map(function (r) { return r.nome; }) };
}

/** Apaga os gatilhos das rotinas e desliga o encerramento automático feito pelo painel. Devolve quantos gatilhos foram apagados. */
function desativarRotinasAutomaticas_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    const fn = tr.getHandlerFunction();
    if (ROTINAS_.some(function (r) { return r.fn === fn; })) { ScriptApp.deleteTrigger(tr); n++; }
  });
  PropertiesService.getScriptProperties().setProperty('ROTINAS_DESATIVADAS', '1');
  return n;
}

/* --- backup diário --- */

/** Pasta "GDV - Backups" no Drive do dono (id em PASTA_BACKUPS; recriada se sumir). */
function pastaBackups_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_BACKUPS');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder(BACKUP_PASTA);
  props.setProperty('PASTA_BACKUPS', nova.getId());
  return nova;
}

/**
 * Copia a planilha inteira para "GDV - Backups/GDV backup AAAA-MM-DD" (dia de Manaus) e manda para a lixeira as cópias antigas dessa pasta:
 * fica uma por dia (a mais nova) e só as 30 mais recentes. Grava ULTIMO_BACKUP {em, nome, id}. Nunca lança erro (falha vai para
 * ULTIMO_BACKUP_ERRO e para o retorno).
 */
function backupDiario() {
  const props = PropertiesService.getScriptProperties();
  try {
    const nome = BACKUP_PREFIXO + hojeManaus_(), pasta = pastaBackups_();
    const copia = DriveApp.getFileById(planilha_().getId()).makeCopy(nome, pasta);
    let apagados = 0;
    try { apagados = limparBackups_(pasta, copia.getId()); } catch (e) { /* limpeza fica para o próximo backup */ }
    const info = { em: Date.now(), nome: nome, id: copia.getId() };
    props.setProperty('ULTIMO_BACKUP', JSON.stringify(info));
    return { ok: true, em: info.em, nome: nome, id: info.id, apagados: apagados };
  } catch (e) {
    const erro = String((e && e.message) || e).slice(0, 300);
    try { props.setProperty('ULTIMO_BACKUP_ERRO', JSON.stringify({ em: Date.now(), erro: erro })); } catch (e2) { /* nada a fazer */ }
    return { ok: false, erro: erro };
  }
}

/** Mantém em "GDV - Backups" uma cópia por dia (a mais nova) e só as BACKUP_MANTER mais recentes. Devolve quantas foram para a lixeira. */
function limparBackups_(pasta, manterId) {
  const lst = [], it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed() && String(f.getName()).indexOf(BACKUP_PREFIXO) === 0) lst.push(f);
  }
  const criado = function (f) { try { return Number(f.getDateCreated()) || 0; } catch (e) { return 0; } };
  lst.sort(function (a, b) { return String(b.getName()).localeCompare(String(a.getName())) || criado(b) - criado(a); });   // mais novo primeiro
  const dias = {};
  let mantidos = 0, n = 0;
  lst.forEach(function (f) {
    const nome = String(f.getName()), fica = f.getId() === manterId || (!dias[nome] && mantidos < BACKUP_MANTER);
    if (fica) { if (!dias[nome]) mantidos++; dias[nome] = true; return; }
    try { f.setTrashed(true); n++; } catch (e) { /* sem permissão: segue */ }
  });
  return n;
}

/* --- arquivamento anual --- */
// A planilha principal guarda só o ano atual e o anterior (pela data do registro, horário de Manaus). Linhas mais antigas das abas que
// crescem sem parar vão para uma planilha "e-GDV – Arquivo AAAA" (uma por ano) na pasta "GDV - Arquivo anual" do Drive do dono.
//   Veiculos   acompanham o turno (veículo de turno arquivado vai junto; sem turno na planilha: ano do criadoEm)
//   Turnos     só encerrados (turno aberto nunca sai), pelo campo data
//   Consultas  pelo campo em (sem id: a chave é a linha inteira)
//   Andamento  só os finalizados (estado "fim" ou sem batimento há mais de 10 min), pelo atualizadoTs
// Ficam sempre na principal: TFs, Pessoas, Placas, Levantamentos, Colheitas, Propriedades, Fiscais, Permissoes, Barreiras, Numeracao
// (reincidência, histórico de pragas, numeração e credenciais), Arquivos (links das fotos pelo id) e Aparelhos (uma linha por aparelho).
// Cada lote, sob o mesmo LockService do sync: copia → confere no arquivo (todas as chaves presentes) → apaga da principal com deleteRows em
// blocos contíguos, de baixo para cima. Interrompido em qualquer ponto, a próxima execução refaz o lote sem duplicar (chave = id).

const ARQ_PASTA = 'GDV - Arquivo anual', ARQ_PREFIXO = 'e-GDV – Arquivo ';
const ARQ_ABAS = ['Veiculos', 'Turnos', 'Consultas', 'Andamento'];   // Veiculos antes de Turnos: o ano do veículo vem do turno ainda na principal
const ARQ_LOTE = 5000;                                                 // linhas por lote (um lock por lote; os celulares sincronizam entre os lotes)
const ARQ_TEMPO_MS = 4 * 60 * 1000;                                    // passou disso: guarda o progresso e continua na próxima execução (limite: 6 min)

/** Ano (Manaus) de um instante em ms; 0 se vazio. */
function anoMs_(ms) { ms = Number(ms) || 0; return ms > 0 ? new Date(ms - 4 * 3600 * 1000).getUTCFullYear() : 0; }
/** Ano de um dia "aaaa-mm-dd"; 0 se inválido. */
function anoDia_(d) { const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(d || '')); return m ? Number(m[1]) : 0; }
function anoAtualManaus_() { return Number(hojeManaus_().slice(0, 4)); }

/** Chave de idempotência da linha: o id (1ª coluna); Consultas não têm id → a linha inteira. */
function chaveArq_(nome, linha) {
  return nome === 'Consultas' ? linha.slice(0, TABELAS.Consultas.length).map(function (v) { return String(v === null || v === undefined ? '' : v); }).join('|')
    : String(linha[0] === null || linha[0] === undefined ? '' : linha[0]);
}

/**
 * Ano em que a linha deve ser arquivada, ou 0 (fica na principal). ctx: {limite, agora, turnos: {id: ano de arquivamento ou 0}}.
 * Só arquiva ano < limite (limite = ano anterior ao atual).
 */
function anoArquivo_(nome, o, ctx) {
  let ano = 0;
  if (nome === 'Turnos') ano = o.encerrado === 1 ? anoDia_(o.data) : 0;
  else if (nome === 'Veiculos') {
    if (Object.prototype.hasOwnProperty.call(ctx.turnos, o.turnoId)) return ctx.turnos[o.turnoId];   // acompanha o turno
    ano = anoMs_(o.criadoEm) || anoMs_(o.srv_ts);                                                     // turno fora da principal
  } else if (nome === 'Consultas') ano = anoMs_(o.em);
  else if (nome === 'Andamento') {
    if (o.estado === 'preenchendo' && ctx.agora - o.atualizadoTs <= ANDAMENTO_VALIDADE_MS) return 0;
    ano = anoMs_(o.atualizadoTs) || anoMs_(o.inicioTs);
  }
  return ano && ano < ctx.limite ? ano : 0;
}

/** Pasta "GDV - Arquivo anual" no Drive do dono (id em PASTA_ARQUIVO_ANUAL; recriada se sumir). */
function pastaArquivoAnual_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_ARQUIVO_ANUAL');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* pasta apagada ou sem acesso: cria outra */ }
  }
  const nova = DriveApp.createFolder(ARQ_PASTA);
  props.setProperty('PASTA_ARQUIVO_ANUAL', nova.getId());
  return nova;
}

/** {id, url} da planilha de arquivo do ano guardados em ARQUIVO_ANUAL_AAAA (sem abrir nada); null se não houver. */
function infoArquivoAnual_(ano) {
  const i = lerJSONSeguro_(PropertiesService.getScriptProperties().getProperty('ARQUIVO_ANUAL_' + ano), null);
  return i && i.id ? i : null;
}

/** Planilha "e-GDV – Arquivo AAAA" (abre a guardada; senão procura na pasta; senão cria e move para a pasta). */
function planilhaArquivoAnual_(ano) {
  const props = PropertiesService.getScriptProperties(), info = infoArquivoAnual_(ano), nome = ARQ_PREFIXO + ano;
  if (info) {
    try { if (!DriveApp.getFileById(info.id).isTrashed()) return SpreadsheetApp.openById(info.id); } catch (e) { /* apagada: procura/cria */ }
  }
  const pasta = pastaArquivoAnual_(), it = pasta.getFilesByName(nome);
  let ss = null;
  while (!ss && it.hasNext()) { const f = it.next(); if (!f.isTrashed()) ss = SpreadsheetApp.openById(f.getId()); }
  if (!ss) {
    ss = SpreadsheetApp.create(nome);
    DriveApp.getFileById(ss.getId()).moveTo(pasta);
  }
  props.setProperty('ARQUIVO_ANUAL_' + ano, JSON.stringify({ id: ss.getId(), url: ss.getUrl() }));
  return ss;
}

/** Chaves já gravadas numa aba do arquivo → número da linha (lê só a coluna do id; Consultas: as 5 colunas). */
function chavesArquivo_(sh, nome) {
  const n = sh.getLastRow() - 1, m = {};
  if (n < 1) return m;
  const larg = nome === 'Consultas' ? TABELAS.Consultas.length : 1;
  sh.getRange(2, 1, n, larg).getValues().forEach(function (l, i) { const k = chaveArq_(nome, l); if (k) m[k] = i + 2; });
  return m;
}

/**
 * Um lote de uma aba, sob lock: escolhe até "max" linhas antigas, grava cada uma no arquivo do seu ano (id que já está lá: atualiza a linha
 * se mudou, nunca duplica), confere que todas as chaves estão no arquivo e só então apaga da principal (blocos contíguos, de baixo para cima).
 * Devolve {movidas, porAno: {ano: n}, restam}.
 */
function arquivarLote_(nome, limite, agora, max) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = planilha_().getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) return { movidas: 0, porAno: {}, restam: false };
    const t = lerTudo_(nome), cols = t.cols, ctx = { limite: limite, agora: agora, turnos: {} };
    if (nome === 'Veiculos') lerLeitura_('Turnos').forEach(function (o) { if (o.id) ctx.turnos[o.id] = anoArquivo_('Turnos', o, ctx); });
    const sel = [];
    t.valores.forEach(function (l, i) {
      const k = chaveArq_(nome, l);
      if (!k || k === '||||') return;                                             // linha vazia
      const ano = anoArquivo_(nome, paraObjeto_(cols, l), ctx);
      if (ano) sel.push({ i: i, ano: ano, k: k, l: l });
    });
    const lote = sel.slice(0, max);
    if (!lote.length) return { movidas: 0, porAno: {}, restam: false };
    const porAno = {};
    lote.forEach(function (x) { (porAno[x.ano] = porAno[x.ano] || []).push(x); });
    Object.keys(porAno).forEach(function (ano) {
      const shA = abaDe_(planilhaArquivoAnual_(ano), nome), ja = chavesArquivo_(shA, nome), novas = [], vistas = {};
      porAno[ano].forEach(function (x) {
        const linha = cols.map(function (c, j) { return x.l[j] === undefined || x.l[j] === null ? '' : x.l[j]; });
        if (ja[x.k]) {                                                            // já arquivada (execução interrompida ou reenvio do aparelho)
          const atual = shA.getRange(ja[x.k], 1, 1, cols.length).getValues()[0];
          if (linha.some(function (v, j) { return String(v) !== String(atual[j] === undefined || atual[j] === null ? '' : atual[j]); })) {
            shA.getRange(ja[x.k], 1, 1, cols.length).setValues([linha]);
          }
        } else if (vistas[x.k] === undefined) { vistas[x.k] = novas.length; novas.push(linha); }
        else novas[vistas[x.k]] = linha;                                          // id repetido na principal: fica a última
      });
      if (novas.length) shA.getRange(shA.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
      SpreadsheetApp.flush();
      const conferidas = chavesArquivo_(shA, nome), faltam = porAno[ano].filter(function (x) { return !conferidas[x.k]; }).length;
      if (faltam) throw new Error('Conferência do arquivo ' + ano + ' (' + nome + ') falhou: ' + faltam + ' linha(s) não gravada(s). Nada foi apagado da planilha.');
    });
    // apaga da principal: blocos contíguos, de baixo para cima (cada deleteRows não mexe nas linhas de cima ainda por apagar)
    const idx = lote.map(function (x) { return x.i + 2; }).sort(function (a, b) { return b - a; });
    if (sh.getMaxRows() <= sh.getLastRow()) sh.insertRowsAfter(sh.getMaxRows(), 1);   // o Sheets não deixa apagar todas as linhas não congeladas
    for (let j = 0; j < idx.length;) {
      let fim = idx[j], ini = fim, k = j + 1;
      while (k < idx.length && idx[k] === ini - 1) { ini--; k++; }
      sh.deleteRows(ini, fim - ini + 1);
      j = k;
    }
    SpreadsheetApp.flush();
    const cont = {};
    Object.keys(porAno).forEach(function (ano) { cont[ano] = porAno[ano].length; });
    return { movidas: lote.length, porAno: cont, restam: sel.length > lote.length };
  } finally {
    lock.releaseLock();
  }
}

/** Há algo a arquivar? Verificação leve (Turnos, Consultas e Andamento; Veiculos seguem os turnos e não são lidos aqui). */
function haLinhasAntigas_(limite, agora) {
  const ctx = { limite: limite, agora: agora, turnos: {} };
  return ['Turnos', 'Consultas', 'Andamento'].some(function (nome) {
    return lerLeitura_(nome).some(function (o) { return anoArquivo_(nome, o, ctx) > 0; });
  });
}

/** Gatilho diário (~04h). Sem nada antigo na planilha, só lê três abas pequenas e sai. */
function arquivarAnosAntigos() { return arquivarAnosAntigos_({}); }

/**
 * Arquivamento anual. opcoes: {manual (menu; roda mesmo com as rotinas desativadas), lote, tempoMs (testes)}.
 * Sessão nova: confere se há linhas antigas, faz o backup (sem backup não arquiva) e processa as abas na ordem de ARQ_ABAS, um lote por vez.
 * Tempo esgotado: guarda ARQUIVO_PROGRESSO {aba, porAba, em} e a próxima execução continua de onde parou (sem novo backup).
 * Fim: limpa caches, grava ULTIMO_ARQUIVAMENTO {em, porAba, arquivos}. Nunca lança erro (falha vai para ULTIMO_ARQUIVAMENTO_ERRO e para o retorno).
 * Devolve {ok, nada?, incompleto?, porAba: {Aba: {ano: n}}, total, arquivos: [{ano, url}], backup?}.
 */
function arquivarAnosAntigos_(opcoes) {
  opcoes = opcoes || {};
  const props = PropertiesService.getScriptProperties();
  if (!opcoes.manual && rotinasDesativadas_()) return { ok: true, desativado: true };
  const max = Number(opcoes.lote) > 0 ? Number(opcoes.lote) : ARQ_LOTE, tempo = opcoes.tempoMs >= 0 ? Number(opcoes.tempoMs) : ARQ_TEMPO_MS;
  try {
    const t0 = Date.now(), limite = anoAtualManaus_() - 1;
    const prog = lerJSONSeguro_(props.getProperty('ARQUIVO_PROGRESSO'), null);
    let backup = null;
    if (!prog) {
      if (!haLinhasAntigas_(limite, t0)) return { ok: true, nada: true, porAba: {}, total: 0, arquivos: [] };
      backup = backupDiario();
      if (!backup.ok) throw new Error('Backup antes do arquivamento falhou (' + backup.erro + '). Nada foi arquivado.');
    }
    const porAba = (prog && prog.porAba) || {};
    let i = prog ? Math.max(0, ARQ_ABAS.indexOf(prog.aba)) : 0;
    for (; i < ARQ_ABAS.length; i++) {
      const nome = ARQ_ABAS[i];
      for (;;) {
        const r = arquivarLote_(nome, limite, Date.now(), max);
        Object.keys(r.porAno).forEach(function (ano) { const a = porAba[nome] = porAba[nome] || {}; a[ano] = (a[ano] || 0) + r.porAno[ano]; });
        const resta = r.restam || i < ARQ_ABAS.length - 1;
        if (Date.now() - t0 >= tempo && resta) {
          props.setProperty('ARQUIVO_PROGRESSO', JSON.stringify({ aba: r.restam ? nome : ARQ_ABAS[i + 1], porAba: porAba, em: Date.now() }));
          return resumoArquivamento_({ ok: true, incompleto: true, backup: backup }, porAba);
        }
        if (!r.restam) break;
      }
    }
    props.deleteProperty('ARQUIVO_PROGRESSO');
    const cache = CacheService.getScriptCache();                     // nenhum cache guarda linhas dessas abas; estes dois dependem de Turnos/consultas
    ['auto_encerrar', 'indice_reinc'].forEach(function (k) { try { cache.remove(k); } catch (e) { /* segue */ } });
    const r = resumoArquivamento_({ ok: true, backup: backup }, porAba);
    props.setProperty('ULTIMO_ARQUIVAMENTO', JSON.stringify({ em: Date.now(), porAba: porAba, total: r.total, arquivos: r.arquivos }));
    return r;
  } catch (e) {
    const erro = String((e && e.message) || e).slice(0, 300);
    try { props.setProperty('ULTIMO_ARQUIVAMENTO_ERRO', JSON.stringify({ em: Date.now(), erro: erro })); } catch (e2) { /* nada a fazer */ }
    return { ok: false, erro: erro };
  }
}

function resumoArquivamento_(r, porAba) {
  const anos = {};
  let total = 0;
  Object.keys(porAba).forEach(function (aba) { Object.keys(porAba[aba]).forEach(function (ano) { anos[ano] = true; total += porAba[aba][ano]; }); });
  r.porAba = porAba; r.total = total;
  r.arquivos = Object.keys(anos).sort().map(function (ano) { const i = infoArquivoAnual_(ano); return { ano: Number(ano), url: i ? i.url : '' }; });
  return r;
}

/**
 * Aviso do painel quando o período começa antes de 1º/jan do ano anterior e já existe arquivo anual de algum ano do período:
 * {texto, arquivos: [{ano, url}]} (só lê as propriedades; não abre os arquivos). null = nada a avisar.
 */
function avisoArquivo_(de) {
  const limite = anoAtualManaus_() - 1, ini = anoDia_(de);
  if (!ini || ini >= limite) return null;
  const arquivos = [];
  for (let ano = ini; ano < limite; ano++) { const i = infoArquivoAnual_(ano); if (i && i.url) arquivos.push({ ano: ano, url: i.url }); }
  if (!arquivos.length) return null;
  return { texto: 'Dados de veículos e turnos de ' + arquivos.map(function (a) { return a.ano; }).join(' e ') + ' estão no arquivo anual: ' +
                  arquivos.map(function (a) { return a.url; }).join(' · '), arquivos: arquivos };
}

/* --- relatório mensal --- */

const MESES_ = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const RE_EMAIL_ = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;

/** Mês anterior a "hoje" (aaaa-mm-dd): {de, ate, rotulo: "setembro de 2026"}. */
function mesAnterior_(hoje) {
  const y = Number(hoje.slice(0, 4)), m = Number(hoje.slice(5, 7));
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return { de: py + '-' + String(pm).padStart(2, '0') + '-01', ate: somarDias_(hoje.slice(0, 8) + '01', -1), rotulo: MESES_[pm - 1] + ' de ' + py };
}

/** Texto "a@x, b@y" → lista de e-mails (erro com o primeiro inválido). Vazio = lista vazia. */
function listaEmails_(texto) {
  const lst = String(texto || '').split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  lst.forEach(function (e) { if (!RE_EMAIL_.test(e)) throw new Error('E-mail inválido: ' + e.slice(0, 80)); });
  return lst.filter(function (e, i) { return lst.indexOf(e) === i; }).slice(0, 20);
}

/** Destinatários do relatório: propriedade RELATORIO_EMAILS ou, sem ela, o dono da planilha. */
function destinatariosRelatorio_() {
  let lst = [];
  try { lst = listaEmails_(PropertiesService.getScriptProperties().getProperty('RELATORIO_EMAILS')); } catch (e) { lst = []; }
  if (lst.length) return lst;
  let dono = '';
  try { dono = Session.getEffectiveUser().getEmail(); } catch (e) { dono = ''; }
  return dono ? [dono] : [];
}

/** Grava os destinatários (texto separado por vírgula). Vazio = volta ao padrão (dono da planilha). Devolve a lista efetiva. */
function definirEmailsRelatorio_(texto) {
  const lst = listaEmails_(texto), props = PropertiesService.getScriptProperties();
  if (lst.length) props.setProperty('RELATORIO_EMAILS', lst.join(', ')); else props.deleteProperty('RELATORIO_EMAILS');
  return destinatariosRelatorio_();
}

/**
 * Números do período a partir do resultado de dadosPainel_ (mesmos campos e regras do painel). Turnos pela data de início; horas de barreira:
 * encerrado = fim − início; ainda aberto = até agora, no máximo 12 h. TFs e termos cancelados ficam fora das contagens (vêm à parte).
 */
function agregarRelatorio_(d, de, ate, agora) {
  const noPer = function (r) { return r.data >= de && r.data <= ate; };
  const porBarreira = {}, tot = { turnos: 0, minutos: 0, veiculos: 0, pessoas: 0 }, enc = { automatico: 0, gerencia: 0, abertos: 0 };
  d.turnos.filter(noPer).forEach(function (t) {
    const k = t.local || '(sem local)';
    const b = porBarreira[k] = porBarreira[k] || { barreira: k, turnos: 0, minutos: 0, veiculos: 0, pessoas: 0 };
    let min = 0;
    if (t.inicioTs !== null) {
      const f = t.encerrado === 1 ? t.fimTs : Math.min(agora, t.inicioTs + TURNO_MAX_MS);
      if (f !== null && f > t.inicioTs) min = (f - t.inicioTs) / 60000;
    }
    [b, tot].forEach(function (x) { x.turnos++; x.minutos += min; x.veiculos += t.nVeiculos; x.pessoas += t.nPessoas; });
    if (t.encerrado !== 1) enc.abertos++;
    else if (String(t.encerradoPor || '').indexOf('Automático') === 0) enc.automatico++;
    else if (t.encerradoPor) enc.gerencia++;
  });
  const tfsVal = d.tfs.filter(function (r) { return r.cancelado !== 1; });
  const proc = { liberacao: 0, apreensao: 0, rechaco: 0, outro: 0 };
  tfsVal.forEach(function (r) { proc[proc.hasOwnProperty(r.procedimento) ? r.procedimento : 'outro']++; });
  const apreensoes = tfsVal.filter(function (r) { return r.procedimento === 'apreensao'; })
    .sort(function (a, b) { return String(a.data + a.hora).localeCompare(String(b.data + b.hora)); })
    .map(function (r) { return { numeroTxt: r.numeroTxt, data: r.data, local: r.local, produtos: r.produtos.map(function (p) { return p.texto; }).join('; ') }; });
  const pragas = {}, municipios = {};
  d.levantamentos.forEach(function (l) {
    if (l.municipio) municipios[l.municipio] = true;
    l.culturas.forEach(function (c) {                                       // detectada e suspeita contam como detecção (suspeita também à parte)
      if (!c.praga) return;
      const p = pragas[c.praga] = pragas[c.praga] || { praga: c.praga, deteccoes: 0, suspeitas: 0, municipios: {} };
      p.deteccoes++; if (c.resultado === 'suspeita') p.suspeitas++; if (l.municipio) p.municipios[l.municipio] = true;
    });
  });
  const suspeitas = d.levantamentos.reduce(function (s, l) { return s + l.culturas.filter(function (c) { return c.praga && c.resultado === 'suspeita'; }).length; }, 0);
  const termos = d.colheitas.filter(function (c) { return c.cancelado !== 1; });
  return {
    de: de, ate: ate,
    barreiras: Object.keys(porBarreira).map(function (k) { return porBarreira[k]; }).sort(function (a, b) { return b.turnos - a.turnos || a.barreira.localeCompare(b.barreira); }),
    total: tot, encerramentos: enc,
    tfs: { total: tfsVal.length, liberacao: proc.liberacao, apreensao: proc.apreensao, rechaco: proc.rechaco, outro: proc.outro,
           autos: tfsVal.filter(function (r) { return r.auto === 1; }).length, advertencias: tfsVal.filter(function (r) { return r.advertencia === 1; }).length,
           cancelados: d.tfs.length - tfsVal.length, apreensoes: apreensoes },
    pce: { levantamentos: d.levantamentos.length, municipios: Object.keys(municipios).length,
           comPraga: d.levantamentos.filter(function (l) { return l.pragas.length; }).length,
           negativos: d.levantamentos.filter(function (l) { return !l.pragas.length; }).length,   // nenhuma praga detectada nem suspeita
           suspeitas: suspeitas,
           pragas: Object.keys(pragas).map(function (k) { const p = pragas[k]; return { praga: p.praga, deteccoes: p.deteccoes, suspeitas: p.suspeitas, municipios: Object.keys(p.municipios).sort() }; })
             .sort(function (a, b) { return b.deteccoes - a.deteccoes || a.praga.localeCompare(b.praga); }),
           termos: termos.length, termosCancelados: d.colheitas.length - termos.length }
  };
}

function escHtml_(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function numBR_(n, casas) {
  const s = Number(n || 0).toFixed(casas || 0).split('.');
  return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (s[1] ? ',' + s[1] : '');
}
function diaBR_(d) { return String(d || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'); }

/** E-mail HTML do relatório (tabelas simples, lidas em qualquer cliente de e-mail). */
function htmlRelatorio_(a, rotulo) {
  const th = 'style="text-align:left;padding:4px 8px;border-bottom:2px solid #c9d3e3;background:#eef2f8"';
  const td = 'style="padding:4px 8px;border-bottom:1px solid #e3e8f0"', tdn = 'style="padding:4px 8px;border-bottom:1px solid #e3e8f0;text-align:right"';
  const tabela = function (cab, linhas, numericas) {
    return '<table style="border-collapse:collapse;font-size:14px;margin:6px 0 14px">' +
      '<tr>' + cab.map(function (c) { return '<th ' + th + '>' + escHtml_(c) + '</th>'; }).join('') + '</tr>' +
      linhas.map(function (l) { return '<tr>' + l.map(function (v, i) { return '<td ' + (numericas.indexOf(i) >= 0 ? tdn : td) + '>' + escHtml_(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  };
  const h = function (t) { return '<h3 style="margin:18px 0 4px;color:#1f3b63">' + escHtml_(t) + '</h3>'; };
  const horas = function (m) { return numBR_(m / 60, 1); };
  let out = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1d2433;max-width:760px">' +
    '<h2 style="margin:0 0 4px">e-GDV – Relatório mensal: ' + escHtml_(rotulo) + '</h2>' +
    '<p style="margin:0;color:#5b6475">Período ' + diaBR_(a.de) + ' a ' + diaBR_(a.ate) + ' (horário de Manaus).</p>';
  out += h('Barreiras (Educação Sanitária/Fiscalização de Trânsito)');
  out += a.barreiras.length ? tabela(['Barreira', 'Turnos', 'Horas de barreira', 'Veículos', 'Pessoas'],
    a.barreiras.map(function (b) { return [b.barreira, numBR_(b.turnos), horas(b.minutos), numBR_(b.veiculos), numBR_(b.pessoas)]; })
      .concat([['Total', numBR_(a.total.turnos), horas(a.total.minutos), numBR_(a.total.veiculos), numBR_(a.total.pessoas)]]), [1, 2, 3, 4])
    : '<p>Nenhum turno no período.</p>';
  out += '<p style="margin:0 0 4px">Turnos encerrados automaticamente (aberto há mais de 12 h): <b>' + numBR_(a.encerramentos.automatico) + '</b> · ' +
    'encerrados pela gerência: <b>' + numBR_(a.encerramentos.gerencia) + '</b>' +
    (a.encerramentos.abertos ? ' · ainda abertos: <b>' + numBR_(a.encerramentos.abertos) + '</b>' : '') + '</p>';
  out += h('TF de Barreira');
  out += tabela(['Procedimento', 'TFs'], [['Liberação', numBR_(a.tfs.liberacao)], ['Apreensão', numBR_(a.tfs.apreensao)], ['Rechaço', numBR_(a.tfs.rechaco)]]
    .concat(a.tfs.outro ? [['Outro', numBR_(a.tfs.outro)]] : []).concat([['Total', numBR_(a.tfs.total)]]), [1]);
  out += '<p style="margin:0 0 4px">Autos de infração: <b>' + numBR_(a.tfs.autos) + '</b> · advertências: <b>' + numBR_(a.tfs.advertencias) + '</b>' +
    (a.tfs.cancelados ? ' · cancelados (fora da contagem): ' + numBR_(a.tfs.cancelados) : '') + '</p>';
  if (a.tfs.apreensoes.length) {
    out += '<p style="margin:8px 0 0"><b>Apreensões</b></p>' + tabela(['TF', 'Data', 'Local', 'Produtos'],
      a.tfs.apreensoes.slice(0, 50).map(function (x) { return [x.numeroTxt, diaBR_(x.data), x.local, x.produtos]; }), []) +
      (a.tfs.apreensoes.length > 50 ? '<p>… e mais ' + (a.tfs.apreensoes.length - 50) + ' (veja no painel).</p>' : '');
  }
  out += h('PCE');
  out += '<p style="margin:0 0 4px">Levantamentos: <b>' + numBR_(a.pce.levantamentos) + '</b> em ' + numBR_(a.pce.municipios) + ' município(s) · ' +
    'com praga detectada ou suspeita: <b>' + numBR_(a.pce.comPraga) + '</b> · levantamentos negativos: <b>' + numBR_(a.pce.negativos || 0) + '</b>' +
    (a.pce.suspeitas ? ' · suspeitas: <b>' + numBR_(a.pce.suspeitas) + '</b>' : '') + ' · Termos de Colheita: <b>' + numBR_(a.pce.termos) + '</b>' +
    (a.pce.termosCancelados ? ' (cancelados fora da contagem: ' + numBR_(a.pce.termosCancelados) + ')' : '') + '</p>';
  out += a.pce.pragas.length ? tabela(['Praga', 'Detecções', 'Suspeitas (incluídas)', 'Municípios'],
    a.pce.pragas.map(function (p) { return [p.praga, numBR_(p.deteccoes), numBR_(p.suspeitas || 0), p.municipios.join(', ')]; }), [1, 2])
    : '<p>Nenhuma praga detectada no período.</p>';
  const url = painelUrl_();
  out += '<p style="margin-top:18px">Detalhes, gráficos e mapa no painel: <a href="' + escHtml_(url) + '">' + escHtml_(url) + '</a></p>' +
    '<p style="color:#5b6475;font-size:12px">E-mail automático do e-GDV (menu e-GDV da planilha → Definir e-mails do relatório mensal).</p></div>';
  return out;
}

/** Gatilho mensal (dia 1): envia o relatório do mês anterior. */
function relatorioMensal() {
  return enviarRelatorio_(mesAnterior_(hojeManaus_()));
}

/** Monta e envia o relatório de um período {de, ate, rotulo}. Grava ULTIMO_RELATORIO. */
function enviarRelatorio_(per) {
  const para = destinatariosRelatorio_();
  if (!para.length) throw new Error('Sem destinatários: use e-GDV → Definir e-mails do relatório mensal.');
  const d = dadosPainel_('Relatório mensal', { de: per.de, ate: per.ate });
  const a = agregarRelatorio_(d, per.de, per.ate, Date.now());
  const assunto = 'e-GDV – Relatório mensal de ' + per.rotulo;
  const texto = 'e-GDV – Relatório mensal de ' + per.rotulo + ' (' + diaBR_(per.de) + ' a ' + diaBR_(per.ate) + ')\n' +
    'Turnos: ' + a.total.turnos + ' · horas de barreira: ' + numBR_(a.total.minutos / 60, 1) + ' · veículos: ' + a.total.veiculos + ' · pessoas: ' + a.total.pessoas + '\n' +
    'TFs: ' + a.tfs.total + ' (apreensões: ' + a.tfs.apreensao + ') · levantamentos: ' + a.pce.levantamentos + ' · termos de colheita: ' + a.pce.termos + '\n' +
    'Painel: ' + painelUrl_();
  MailApp.sendEmail({ to: para.join(','), subject: assunto, htmlBody: htmlRelatorio_(a, per.rotulo), body: texto, name: 'e-GDV' });
  PropertiesService.getScriptProperties().setProperty('ULTIMO_RELATORIO', JSON.stringify({ em: Date.now(), de: per.de, ate: per.ate, para: para }));
  return { ok: true, para: para, assunto: assunto, numeros: a };
}

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

/* ---------- Planilha ---------- */

function planilha_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  let ss = SpreadsheetApp.getActiveSpreadsheet();   // projeto criado a partir da planilha
  if (!ss) ss = SpreadsheetApp.create('GDV - Controle de Veículos (banco de dados)');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function aba_(nome) {
  return abaDe_(planilha_(), nome);
}

/** Aba "nome" na planilha ss (a principal ou um arquivo anual), criada com o cabeçalho de TABELAS se não existir. */
function abaDe_(ss, nome) {
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    const cols = TABELAS[nome];
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#dbe6f7');
    sh.setFrozenRows(1);
    // Texto puro: impede o Sheets de converter datas/placas ou interpretar fórmulas.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  } else {
    garantirColunas_(sh, nome);
  }
  return sh;
}

/** Planilhas criadas por versões anteriores ganham as colunas novas (no fim), sem mexer nos dados.
 *  Coluna acrescentada à mão no lugar de uma coluna nova do sistema (ex.: uma anotação na coluna AD de Levantamentos):
 *  ela é empurrada para a direita com os dados dela, e a coluna do sistema entra no lugar (antes isso travava todos os envios). */
function garantirColunas_(sh, nome) {
  const cols = TABELAS[nome];
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  let atual = sh.getRange(1, 1, 1, cols.length).getValues()[0], copias = false;
  cols.forEach(function (c, i) {
    if (atual[i] === c) return;
    if (atual[i] !== '' && atual[i] !== undefined && atual[i] !== null) {
      // As colunas 1..i já conferem (são acertadas em ordem). Uma coluna do sistema repetida aqui é cópia antiga
      // (sobra de ajuste à mão no cabeçalho): ela anda para a direita como qualquer coluna de fora, sem apagar nada,
      // e o que só existir na cópia é levado para a coluna oficial.
      if (cols.slice(0, i).indexOf(String(atual[i])) >= 0) copias = true;
      sh.insertColumnBefore(i + 1);                                   // a coluna de fora (e o que vem depois) anda uma posição
      atual = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    }
    sh.getRange(1, i + 1).setValue(c).setFontWeight('bold').setBackground('#dbe6f7');
    sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  if (copias) {                                                     // cópias antigas (agora à direita): o que só existe nelas vai para a coluna oficial
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    for (let j = cols.length; j < cab.length; j++) { const k = cols.indexOf(String(cab[j])); if (k >= 0) aproveitarCopia_(sh, k + 1, j + 1); }
  }
}

/** Cópia antiga de uma coluna do sistema (coluna `colCopia`): preenche as células vazias da coluna oficial (`colOficial`) com o valor da cópia. */
function aproveitarCopia_(sh, colOficial, colCopia) {
  const n = sh.getLastRow() - 1; if (n < 1) return;
  const of = sh.getRange(2, colOficial, n, 1).getValues(), cp = sh.getRange(2, colCopia, n, 1).getValues();
  let mudou = false;
  for (let r = 0; r < n; r++) {
    const vazio = of[r][0] === '' || of[r][0] === null || of[r][0] === undefined;
    if (vazio && cp[r][0] !== '' && cp[r][0] !== null && cp[r][0] !== undefined) { of[r][0] = cp[r][0]; mudou = true; }
  }
  if (mudou) sh.getRange(2, colOficial, n, 1).setValues(of);
}

function lerTudo_(nome) {
  const sh = aba_(nome), cols = TABELAS[nome], n = sh.getLastRow() - 1;
  const valores = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
  return { sh: sh, cols: cols, valores: valores };
}

function paraObjeto_(cols, linha) {
  const o = {};
  cols.forEach(function (c, i) {
    let v = linha[i];
    if (v instanceof Date) v = Utilities.formatDate(v, 'America/Manaus', 'yyyy-MM-dd');
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v === null || v === undefined ? '' : v);
  });
  return o;
}

const CAMPOS_ENCERRAMENTO_ = ['encerrado', 'fim', 'latFim', 'lngFim', 'precFim', 'encerradoPor', 'encerradoEm'];
function gravar_(nome, recebidos, ts, usuario) {
  if (!recebidos.length) return;
  const t = lerTudo_(nome), cols = t.cols, idx = {};
  t.valores.forEach(function (l, i) { idx[String(l[0])] = i; });

  const porId = {}, brutos = {};             // dedup no lote: vale o mais recente
  recebidos.forEach(function (r) {
    const o = limpar_(cols, r);
    if (!o) return;
    if (!porId[o.id] || o.atualizadoEm >= porId[o.id].atualizadoEm) { porId[o.id] = o; brutos[o.id] = r; }
  });

  const novas = [];
  Object.keys(porId).forEach(function (id) {
    const o = porId[id], r = brutos[id];
    o.srv_ts = ts;
    o.usuario = usuario;                       // quem sincronizou (definido pelo servidor, não pelo app)
    const linha = cols.map(function (c) { return o[c]; });
    if (idx[id] === undefined) {
      novas.push(linha);
    } else {
      const atual = paraObjeto_(cols, t.valores[idx[id]]);
      if (o.atualizadoEm >= atual.atualizadoEm) {   // última edição vence
        // campo que o app NÃO enviou (ex.: TF não conhece o e-mail da pessoa, versão antiga do app) mantém o valor da planilha
        cols.forEach(function (c, i) { if (c !== 'srv_ts' && c !== 'usuario' && !(c in r)) linha[i] = t.valores[idx[id]][i]; });
        // turno já encerrado na planilha não reabre: um envio do aparelho com encerrado = 0 (edição local feita antes de saber do
        // encerramento) mantém o encerramento; encerrado pela gerência, o horário final e quem encerrou também não mudam
        if (nome === 'Turnos' && atual.encerrado === 1 && (o.encerrado !== 1 || atual.encerradoPor)) {
          CAMPOS_ENCERRAMENTO_.forEach(function (c) { const i = cols.indexOf(c); if (i >= 0) linha[i] = t.valores[idx[id]][i]; });
        }
        // Termo de Colheita: o resultado laboratorial lançado no painel (ou noutro aparelho) não é apagado por um reenvio do termo
        // com resultado mais velho (ou sem resultado): vale o de atualizadoEm maior
        if (nome === 'Colheitas') { const il = cols.indexOf('laboratorio'); linha[il] = labMaisNovo_(t.valores[idx[id]][il], linha[il]); }
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([linha]);
      } else if (nome === 'Turnos' && o.encerrado === 1 && atual.encerrado !== 1) {
        // encerramento com atualizadoEm mais velho que a planilha (relógio do aparelho corrigido para trás depois de abrir o turno):
        // o turno não pode ficar aberto para sempre; grava só o encerramento e devolve ao aparelho (srv_ts)
        const l2 = t.valores[idx[id]].slice();
        ['encerrado', 'fim', 'latFim', 'lngFim', 'precFim'].forEach(function (c) { const i = cols.indexOf(c); if (i >= 0 && (c in r)) l2[i] = o[c]; });
        l2[cols.indexOf('srv_ts')] = ts;
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([l2]);
      } else if (nome === 'Colheitas' && ('laboratorio' in r)) {
        // termo mais velho que o da planilha, mas com resultado laboratorial mais novo: grava só o resultado
        const il = cols.indexOf('laboratorio'), atualLab = t.valores[idx[id]][il], novo = labMaisNovo_(atualLab, o.laboratorio);
        if (novo !== String(atualLab || '')) {
          const l3 = t.valores[idx[id]].slice(); l3[il] = novo; l3[cols.indexOf('srv_ts')] = ts;
          t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([l3]);
        }
      }
    }
  });
  if (novas.length) {
    t.sh.getRange(t.sh.getLastRow() + 1, 1, novas.length, cols.length).setValues(novas);
  }
}

function lerMudancas_(nome, since, usuario) {
  const t = lerTudo_(nome), i = t.cols.indexOf('srv_ts');
  return t.valores.filter(function (l) { return Number(l[i]) > since; })
                  .map(function (l) { return paraObjeto_(t.cols, l); })
                  .filter(function (o) { return !usuario || usuario === 'Administrador' || o.usuario === usuario; });
}

function limpar_(cols, r) {
  if (!r || !r.id || String(r.id).length > 64) return null;
  const o = {};
  cols.forEach(function (c) {
    let v = r[c];
    if (v === undefined || v === null) v = '';
    o[c] = CAMPOS_NUMERICOS.indexOf(c) >= 0 ? (Number(v) || 0) : String(v).slice(0, LIMITES_TEXTO[c] || 500);
  });
  return o;
}

function lista_(a) {
  if (!Array.isArray(a)) return [];
  if (a.length > MAX_LINHAS_POR_ENVIO) throw new Error('Lote grande demais.');
  return a;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
