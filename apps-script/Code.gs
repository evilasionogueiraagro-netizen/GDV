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
             'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  Fiscais: ['nome', 'codigo', 'expiraEm', 'ativo', 'token', 'ativadoEm', 'perfil',   // perfil: vazio = fiscal, 'admin' = administrador
            'geradoPor',                                                             // quem gerou o código: nome do administrador (painel) ou "planilha" (menu)
            'oculto', 'ocultoPor', 'ocultoEm'],                                      // "Remover da lista" no painel: oculto=1 some da aba Servidores (a linha fica, para auditoria)
  // Termos de Fiscalização de Barreira (TF)
  TFs: ['id', 'barreira', 'ano', 'numero', 'numeroTxt', 'turnoId', 'veiculoId', 'data', 'hora', 'fiscal', 'local', 'placa', 'origem', 'destino',
        'doc', 'nome', 'rg', 'endereco', 'municipio', 'uf', 'telefone', 'relacao', 'inspecao', 'coleta', 'amostras',
        'procedimento', 'fiel', 'auto', 'advertencia', 'documentos', 'produtos', 'constatacao', 'enquadramento',
        'reincidente', 'tfsAnteriores', 'cancelado', 'motivoCancel', 'conflito', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
        'numeroSugerido', 'numeroOrigem', 'emitidoEm',   // auditoria da numeração (colunas novas ficam sempre no fim)
        'fotos', 'assinaturas', 'recusaAssinatura'],    // fotos = JSON [ids]; assinaturas = JSON {fiscalizado, servidor} (ids na aba Arquivos); recusaAssinatura = 1: fiscalizado se recusou
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
                  'pragas'],   // pragas = JSON [{praga, culturas:[{cultura, area, espLinha, espPlanta, resultado, coleta, tipoMaterial, codigoAmostra, destinoAmostra, fotos:[ids]}]}]
                               // (levantamento por praga/doença). culturas/fotos continuam preenchidos (derivados) para registros e relatórios antigos.
  Colheitas: ['id', 'unidade', 'ano', 'numero', 'numeroTxt', 'numeroSugerido', 'numeroOrigem', 'conflito', 'emitidoEm', 'levantamentoId',
              'data', 'hora', 'servidor', 'cargo', 'matricula', 'lotacao', 'municipio', 'doc', 'nome', 'endereco', 'lat', 'lon', 'precisao',
              'cultura', 'quantidade', 'analise', 'partes', 'descricao', 'fotos', 'testemunha1Nome', 'testemunha1Doc', 'testemunha2Nome',
              'testemunha2Doc', 'assinaturas', 'local', 'cancelado', 'motivoCancel', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
              'registroAntigo', 'documentos'],
  Propriedades: ['id', 'codigo', 'nome', 'doc', 'municipio', 'situacaoFundiaria', 'lat', 'lon', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario',
                 'cnpj', 'viaAcesso', 'comercial', 'tipoPropriedade', 'endereco', 'uf'],   // campos comuns do Cadastro de imóvel (PCE): CNPJ, via de acesso, propriedade comercial (sim/nao) e tipo
  // Cadastro de imóvel do PCE (1x por propriedade e programa; hoje: monilíase). Numeração por programa + unidade + ano ("001-2026-AUTAZES").
  // dados = JSON com os campos do programa (culturas/plantas, informações fitossanitárias, levantamento de detecção…); totalPlantas = soma das plantas.
  CadastrosPCE: ['id', 'programa', 'unidade', 'ano', 'numero', 'numeroTxt', 'numeroSugerido', 'numeroOrigem', 'conflito', 'emitidoEm', 'propriedadeId',
                 'doc', 'nome', 'propriedade', 'cnpj', 'data', 'hora', 'municipio', 'uf', 'lat', 'lon', 'servidor', 'cargo', 'matricula', 'lotacao', 'local',
                 'dados', 'totalPlantas', 'fotos', 'assinaturas', 'documentos', 'registroAntigo', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts', 'usuario'],
  // Termo de Fiscalização do PCE (1 por visita; NÃO é o TF de Barreira). Numeração por unidade + ano ("001.2026.AUTAZES").
  // pragas/acoes/tipoLocal/testemunhas = JSON; plantasInspecionadas, amostra e sintomas (sim/nao) alimentam o Relatório de atividades
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
              'turnosEncerradosPendentes', 'fimPendentes', 'ultimoErro', 'ultimoErroEm', 'origem', 'situacao', 'cred', 'primeiroSinal']
};
const CAMPOS_NUMERICOS = ['pessoas', 'encerrado', 'semPlaca', 'excluido', 'criadoEm', 'atualizadoEm', 'srv_ts',
                          'expiraEm', 'ativo', 'ativadoEm', 'oculto', 'ocultoEm',
                          'ano', 'numero', 'ultimo', 'de', 'ate', 'em', 'numeroSugerido', 'emitidoEm', 'amostras', 'inspecao', 'coleta', 'fiel', 'auto',
                          'advertencia', 'reincidente', 'tfsAnteriores', 'cancelado', 'conflito', 'tamanho',
                          'inicioTs', 'atualizadoTs', 'registroAntigo', 'encerradoEm',
                          'standalone', 'online', 'ultimoSinal', 'ultimoErroEm', 'primeiroSinal', 'recusaAssinatura',
                          'totalPlantas', 'plantasInspecionadas'];   // lat/lon/precisao ficam como texto (como em Turnos)
const LIMITES_TEXTO = { constatacao: 3000, enquadramento: 3000, documentos: 2000, produtos: 3000, motivoCancel: 300,
                        culturas: 45000, pragas: 45000, descricao: 3000, fotos: 20000, assinaturas: 1000, obs: 2000,
                        dados: 20000, testemunhas: 1000, hospedeiros: 1000 };   // demais colunas: 500
// culturas/fotos/assinaturas são JSON: cortar o texto invalidaria o JSON (e apagaria as referências no aparelho). Os limites acima
// cabem numa célula (50.000 caracteres) e o app limita a quantidade de culturas/fotos e o tamanho dos campos para nunca chegar neles.
const VALIDADE_CODIGO_MS = 7 * 24 * 3600 * 1000;      // código de ativação vale 7 dias
const MAX_FALHAS_ATIVACAO = 10;                        // tentativas erradas antes de bloquear por 15 min
const MAX_FALHAS_ADMIN = 5;                            // idem para o código de administrador do painel (contador próprio)
const MAX_LINHAS_POR_ENVIO = 2000;

/** Muda a cada atualização do Code.gs: o link /exec aberto no navegador mostra esta data (confere se a nova versão foi implantada). */
const VERSAO_CODIGO = '2026-10-13a';

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
    if (req.action === 'painelPermissoes') return json_(painelPermissoes(req.key, req.nome, req));
    if (req.action === 'painelEncerrarTurno') return json_(painelEncerrarTurno(req.key, req.turnoId, req.fim));
    if (req.action === 'tfVerificar') return json_(tfVerificar_(req));                      // página pública verificar.html: sem credencial
    if (req.action === 'publicoDados') return json_(publicoDados_(req));                    // dashboard público (web/dashboard/): sem credencial, só agregados
    if (req.action === 'painelPublicoConfig') return json_(painelPublicoConfig(req.key));
    if (req.action === 'painelPublicoSalvar') return json_(painelPublicoSalvar(req.key, req.config));
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
    .map(function (p) { return { id: p.id, codigo: p.codigo, nome: p.nome, doc: p.doc, municipio: p.municipio, situacaoFundiaria: p.situacaoFundiaria, lat: p.lat, lon: p.lon }; });
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
 *   painelRevogar {key, nome}        → revoga os acessos de FISCAL com esse nome (administradores só pelo menu da planilha)
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

/** Painel → "Revogar": tira todos os acessos de FISCAL com esse nome (aparelhos e códigos). Administrador só pela planilha. */
function painelRevogar(token, nome) {
  adminDoToken_(token);
  nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, NOME_SERVIDOR_MAX + 20);
  if (!nome) throw new Error('Informe o nome do servidor.');
  const n = revogar_(nome, true);
  if (!n && lerLeitura_('Fiscais').some(function (f) { return f.perfil === 'admin' && f.ativo === 1 && nomeChave_(f.nome) === nomeChave_(nome); })) {
    throw new Error('Acesso de administrador não é retirado pelo painel. Use o menu e-GDV da planilha.');
  }
  return { ok: true, nome: nome, revogados: n };
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
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues()
    .map(function (l) { return paraObjeto_(cols, l); });
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
    return { id: v.id, turnoId: v.turnoId, hora: v.hora, placa: v.placa, tipo: v.tipo, pessoas: v.pessoas, srv_ts: v.srv_ts, usuario: v.usuario };
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
                         nDocumentos: contarFotos_(r.documentos),
                         criadoEm: r.criadoEm, srv_ts: r.srv_ts, usuario: r.usuario });
  });
  const todasColheitas = lerLeitura_('Colheitas').filter(function (r) { return r.id && r.excluido !== 1; });
  const colPer = todasColheitas.filter(noPeriodo);
  const colheitas = colPer.map(function (r) {
    return { id: r.id, unidade: r.unidade, ano: r.ano, numero: r.numero, numeroTxt: r.numeroTxt, numeroSugerido: r.numeroSugerido,
             numeroOrigem: r.numeroOrigem, conflito: r.conflito, emitidoEm: r.emitidoEm, levantamentoId: r.levantamentoId,
             data: r.data, hora: r.hora, servidor: r.servidor, lotacao: r.lotacao, municipio: r.municipio,
             doc: mascararDoc_(r.doc), tipoDoc: tipoDoc_(r.doc), nome: r.nome,
             lat: numOuNulo_(r.lat), lon: numOuNulo_(r.lon), precisao: numOuNulo_(r.precisao),
             cultura: r.cultura, quantidade: r.quantidade, analise: r.analise, partes: r.partes, local: r.local,
             cancelado: r.cancelado, motivoCancel: r.motivoCancel, nFotos: contarFotos_(r.fotos), nDocumentos: contarFotos_(r.documentos),
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
      .map(function (b) { return { id: b.id, nome: b.nome, sufixo: b.sufixo, local: b.local, ativo: b.ativo === 1 }; }),
    auditoria: { tf: auditar('TF', todosTFs, tfsPer), pce: auditar('PCE', todasColheitas, colPer),
                 termosPce: auditar('TPCE', todosTermosPce, termosPcePer), cadastrosPce: auditar('CPCE', todosCadastrosPce, todosCadastrosPce.filter(noPeriodo)) }
  };
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

/** Revoga todos os aparelhos/códigos de um fiscal (pelo nome). Devolve quantos foram revogados. soFiscais: não toca em administradores (painel). */
function revogar_(nome, soFiscais) {
  nome = nomeChave_(nome);
  if (!nome) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = lerTudo_('Fiscais'); let n = 0;
    t.valores.forEach(function (l, i) {
      const f = paraObjeto_(t.cols, l);
      if (nomeChave_(f.nome) === nome && f.ativo === 1 && !(soFiscais && f.perfil === 'admin')) {
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
  let atual = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  cols.forEach(function (c, i) {
    if (atual[i] === c) return;
    if (atual[i] !== '' && atual[i] !== undefined && atual[i] !== null) {
      // a mesma coluna do sistema já está antes: planilha embaralhada à mão; não dá para adivinhar, para por segurança
      if (cols.slice(0, i).indexOf(String(atual[i])) >= 0) throw new Error('Cabeçalho da aba ' + nome + ' diferente do esperado na coluna ' + (i + 1) + ' (coluna "' + atual[i] + '" repetida).');
      sh.insertColumnBefore(i + 1);                                   // a coluna de fora (e o que vem depois) anda uma posição
      atual = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    }
    sh.getRange(1, i + 1).setValue(c).setFontWeight('bold').setBackground('#dbe6f7');
    sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
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
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([linha]);
      } else if (nome === 'Turnos' && o.encerrado === 1 && atual.encerrado !== 1) {
        // encerramento com atualizadoEm mais velho que a planilha (relógio do aparelho corrigido para trás depois de abrir o turno):
        // o turno não pode ficar aberto para sempre; grava só o encerramento e devolve ao aparelho (srv_ts)
        const l2 = t.valores[idx[id]].slice();
        ['encerrado', 'fim', 'latFim', 'lngFim', 'precFim'].forEach(function (c) { const i = cols.indexOf(c); if (i >= 0 && (c in r)) l2[i] = o[c]; });
        l2[cols.indexOf('srv_ts')] = ts;
        t.sh.getRange(idx[id] + 2, 1, 1, cols.length).setValues([l2]);
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
