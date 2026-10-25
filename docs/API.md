# API do e-GDV (apps-script/Code.gs)

Contrato das actions: ao criar, mudar ou remover uma, atualize esta tabela. Regra de negócio fica em `docs/modulos/`.

## Protocolo

- `POST <url>/exec` (URL em `web/js/config.js`), `Content-Type: text/plain;charset=utf-8` (evita preflight CORS), corpo `{"action": "<nome>", ...}`.
- HTTP sempre 200: `{ok: true, ...}` ou `{ok: false, erro}` (em português). Sem módulo liberado: também `semPermissao`, `permissoes`.
- `GET /exec` → `{ok, servico, versao}`. `doPost` despacha por `req.action`; `adm` + maiúscula vai a `admAcao_`.
- Regras portáveis: [PORTABILIDADE.md](PORTABILIDADE.md). Campo novo não cita "drive" nem "planilha".

## Autenticação

- Fiscal (`key`): `ativar` (código de 6 dígitos, uso único) → `autenticar_` (TF/PCE: também `exigirModulo_`).
- Administrador (`key`, painel/TV): `painelAtivar` (código de administrador) → `adminDoToken_`.
- Portal (`sessao`): `admLogin` ou `admCodigo` → `admSessao_` (expira após 30 dias sem uso).

- `ACCESS_KEY` (chave mestra, propriedade do script) vale como `key` de fiscal e de administrador.
- Aba `Fiscais` (`perfil`: vazio = fiscal, `admin` = administrador); sessões em `AdmSessoes` (só hash). Credenciais não se trocam entre tipos.
- Aba `Permissoes` (`veiculos`, `tf`, `pce`, `antigo` = digitar do papel): sem linha = tudo liberado, exceto `antigo` (só `1`, `sim`, `true`, `s`). `MODULO_DA_ACAO`: action → módulo; `arquivoEnviar` vale `tf` se `arquivo.dono = 'tfs'`.
- Registro sem módulo liberado (ou `registroAntigo = 1` sem `antigo`) não é gravado no `sync`: volta em `recusados`.

## App do fiscal (`key` de fiscal)

| action | credencial (módulo) | parâmetros | resposta |
|---|---|---|---|
| `ativar` | nenhuma | `codigo` | `nome`, `token` |
| `ping` | fiscal | `aparelho` | `nome`, `agora` |
| `sync` | por registro | `since`, `aparelho`; listas `turnos`, `veiculos`, `tfs`, `pessoas`, `placas`, `levantamentos`, `colheitas`, `propriedades`, `cadastrosPce`, `termosPce` (máx. 2.000 cada) | `agora`; mudanças desde `since` (do fiscal e dos turnos compartilhados); `barreiras`, `ultimos`, `ultimosPce`, `ultimosDocPce`, `permissoes`, `recusados` |
| `tfConsultar` | tf | `doc` (CPF/CNPJ) e/ou `placa` | `pessoa`, `placa`, `historicoDoc`, `historicoPlaca` |
| `tfProximoNumero` | tf | `barreira`, `ano` | `ultimo`, `proximo` |
| `tfEmitir` | tf | `tf`, `pessoa`, `placa` (opc.); do papel: `tf.registroAntigo = 1` (data não futura; ano = `tf.ano`), `tf.pdfs`, `tf.numeroOrigem = 'papel'` | `emitido: true, numero, emitidoEm, srv_ts`; ou `emitido: false, ocupadoPor` |
| `tfAndamento` | tf | `rascunhoId`, `estado` (`preenchendo`/`fim`), `barreira`, `turnoId`, `placa`, `procedimento`, `local`, `lat`, `lon` | — |
| `tfIndiceReincidencia` | tf | `desde` | `agora`, `completo`, `itens` |
| `turnoConvidar` | veiculos (dono) | `turnoId` | `codigo`, `expiraEm` |
| `turnoParear` | veiculos | `codigo` | `turno`, `veiculos`, `dono` |
| `turnoSair` | veiculos | `turnoId` | `saiu` |
| `pceProximoNumero` | pce | `unidade`, `ano` | `ultimo`, `proximo` |
| `pceEmitir` | pce | `colheita`, `pessoa`, `propriedade` | como `tfEmitir`, + `numeroTxt` |
| `pceConsultar` | pce | `doc` | `pessoa`, `propriedades` (`cnpj`, `empresa`, `endereco`, `uf`, `viaAcesso`, `comercial`, `tipoPropriedade`), contagens, `cadastrosPce` |
| `pceDocNumero` | pce | `tipo` (`termo`/`cadastro`), `unidade`, `ano`, `programa` | `ultimo`, `proximo` |
| `pceDocRegistrar` | pce | `tipo`, `registro`, `pessoa`, `propriedade` | como `pceEmitir` |
| `pceBaixarMunicipio` | pce | `municipios` (lista) | `agora`, `municipios`, `propriedades`, `pessoas`, `cadastrosPce` |
| `pceMapaGeral` | pce | — | `propriedades` com coordenadas (`id`, `codigo`, `nome`, `municipio`, `lat`, `lon`, `resumoLev`; sem produtor nem CPF/CNPJ) |
| `arquivoEnviar` | tf/pce | `arquivo` {`id` (UUID), `dono`, `donoId`, `tipo`, `papel`, `mime`, `rotulo`}, `base64` | `id`, `url`, `driveId`, `existente` |

### Campos nos registros

- `levantamentos[].citros`: texto JSON (ou `''`) do bloco "Cultura do citros", só com praga de citros. Formato: `{v: 1, comercial, naoComercial, naoComercialOutros, atividades[], atividadeOutros, situacao, situacaoOutras, culturas[{atividade, cultivar, area, idade, plantas, producao}], entrega, formasEntrega[], compradores[], compradorOutros, beneficia, beneficiaTipo, materiais[], origemMaterial, delimitacao.pintapreta{tem, tempo, controle, qual}, deteccao.hlb|acaro|cancro{tem, tempo}, rt{nome, conselho}}`. Sim/não = `'sim'`/`'nao'` (em `deteccao`, `'sim'` = presença). `citrosTexto_` normaliza (textos ≤ 200, números ≥ 0, ≤ 20 `culturas`; inválido = `''`).
- `levantamentos[]`: `cnpj` (14 dígitos), `empresa` (≤ 120), `endereco` (≤ 200), `uf` (2 letras); `identLev_`.
- `CadastrosPCE` e `TermosPCE` (`programa = 'citros'`): cadastro = `dados` (JSON acima + `levantamentoId`, `codigoPropriedade`, `endereco`, `telefone`, `email`, `empresa`, `culturasAvaliadas[]`, `amostra`); termo = `tipoLocal`, `constatacao`.
- `tfs[]`, `tf`, `veiculos[]`: `ufOrigem`, `ufDestino` (opcionais, sigla de `CONFIG.ufs`). TF antigo sem a coluna: UF por `ufDoTexto_` (texto de `origem`/`destino`).
- Colunas novas no fim de `Levantamentos`, `Propriedades`, `TFs` e `Veiculos`; campo não enviado mantém o da planilha. `veiculos[]`: `semEducacao`, `medidaFito`, `carga`, `produtos`, `partida`, `inspecaoFito`, `docConferido` são só histórico.

## Painel do administrador

Todas com `key` de administrador, exceto `painelAtivar`.

| action | parâmetros | resposta |
|---|---|---|
| `painelAtivar` | `codigo` (de administrador) | `nome`, `token` |
| `painelSair` | — | — |
| `painelDados` | `de`, `ate`, `aoVivo` (modo TV), `ids` | `periodo`, `turnos`, `veiculos`, `tfs`, `tfsAndamento`, `levantamentos`, `colheitas`, `historicoPce`, `termosPce`, `cadastrosPce`, `barreiras`, `auditoria`; sem `aoVivo`: `rotinas`, `avisoArquivo` |
| `painelGerarCodigo` | `nome`, `modulos` | `nome`, `codigo`, `expiraEm` |
| `painelAcessos` | `ocultos` (`true` inclui os removidos) | `acessos`, `agora`, `ocultarAdmin` |
| `painelOcultarAcesso` / `painelRestaurarAcesso` | `nome`, `perfil` (`admin`; vazio = fiscal) | `ocultos` / `restaurados` |
| `painelRevogar` / `painelRevogarAdmin` | `nome` | `nome`, `revogados` |
| `painelPermissoes` | `nome`, `modulos` | `nome`, `permissoes`, `atualizadoEm` |
| `painelEncerrarTurno` | `turnoId`, `fim` (HH:MM) | `turno` |
| `painelPceLaudo` | `id`, `laboratorio` | `numeroTxt`, `laboratorio` |
| `painelPublicoConfig` / `painelPublicoSalvar` | `config` (no salvar) | `config`, `url`, `padrao`, `periodos` |
| `painelConvenios` | — | `admin`, `hoje`, `convenios`, `semente`, `lancamentos`, `financeiro`, `relatorios` |
| `painelConvApuracao` | `convenio`, `de`, `ate` | `convenio`, `de`, `ate`, `apuradoEm`, `etapas` |
| `painelConvSalvar` | `convenio`, `config` | `config` |
| `painelConvRelSalvar` | `convenio`, `mes`, `numero`, `textos` | `relatorio` |
| `painelRelGdv` | `ano` | `ano`, `hoje`, `textos`, `lancamentos` |
| `painelRelGdvSalvar` | `tipo` (`mensal`/`anual`/`vigifito`), `ano`, `mes`, `textos` | `ano`, `gravados`, `usuario`, `atualizadoEm` |
| `painelRelGdvApuracao` | `de`, `ate` (máx. 1 ano), `grupos` | `apuradoEm`, `meses`, `resumo`, `laboratorio` |
| `painelVigDados` | `ano` | `ano`, `cfg`, `indicadores`, `lancamentos`, `apuracao` |
| `painelVigConfigSalvar` | `config` | `config` |
| `painelAdmLista` | `ocultos` | `max`, `google`, `url`, `ocultar`, `liberados` |
| `painelAdmSalvar` | `id`, `nome`, `email`, `ativo` | `liberado` |
| `painelAdmCodigo` | `id` | `nome`, `codigo`, `expiraEm`, `permanente`, `url` |
| `painelAdmOcultar` | `id`, `restaurar` | `id`, `nome`, `oculto` |

Legado (`MSG_PORTAL`, podem sair): `painelConvLancar`, `painelConvExcluir`, `painelConvFinLancar`, `painelConvFinImportar`, `painelConvFinExcluir`.

## Portal do Administrativo (`sessao`)

- Login: `admLogin` (`idToken` do Google; `GOOGLE_CLIENT_ID`) ou `admCodigo` (`codigo` do painel). Ambos devolvem `sessao`, `nome`, `email`, `expiraEm`, `origem`.
- `adm` + maiúscula exige `sessao`; token do painel ou do app não vale. Toda gravação vai a `AdmHistorico`.

| action | parâmetros | resposta |
|---|---|---|
| `admSair` | — | — |
| `admDados` | — | `nome`, `email`, `expiraEm`, `hoje`, `painelUrl`, `convenios`, `servidores`, `lancamentos`, `financeiro` |
| `admConvLancar` / `admConvFinLancar` | `lancamento` (`municipio` opcional no financeiro) | `lancamento`, `financeiro` ou `avisos` |
| `admConvExcluir` / `admConvFinExcluir` | `id` | `id` |
| `admConvFinImportar` | `convenio`, `arquivo`, `itens`, `excluir` (máx. 500) | `novos`, `atualizados`, `iguais`, `excluidos`, `lancamentos`, `arquivo` |
| `admRelDados` | `ano` | `ano`, `hoje`, `lancamentos` |
| `admRelLancar` | `ano`, `lancamentos` (máx. 3.000) | `ano`, `gravados`, `usuario`, `atualizadoEm` |
| `admVigDados` | `ano` | como `painelVigDados` |
| `admVigLancar` / `admVigImportar` | `lancamentos` / `arquivo`, `itens` | `novos`, `atualizados`, `iguais`, `excluidos` |
| `admPlantaoImportar` | `posto` (VIGIFITO), `troca` (HH:MM), `fiscal`, `arquivo`, `dias` [{`data`, `tipos` {PA, UT, CC, CB, ON, MT}, `educacao`}], `cargas` [{`data`, `hora`, `tipo`, `placa`, `origemMun`, `ufOrigem`, `destinoMun`, `ufDestino`, `transportador`, `produto`, `quantidade`, `unidade`, `documento`, `medida`, `tf`}] (máx. 3.000), `substituir` | `id`, `turnos`, `veiculos`, `cargas`, `liberacao`, `apreensao`, `tfs`, `educacao`, `substituidos`, `turnosDoApp`, `avisos`. Já importado: `ok: false`, `jaImportado`, `importadoEm`, `por`, `resumo` |
| `admHistorico` | `aba`, `registro` | `historico` (últimas 300) |

## Públicas (sem credencial)

| action | parâmetros | resposta | proteções |
|---|---|---|---|
| `tfVerificar` | `id` (UUID do TF) | `encontrado`, `tf` (dados mascarados) | placa mascarada; máx. 30 ids inválidos/min |
| `publicoDados` | `periodo` (`15d`, `30d`, `ano`, `anoAnterior`, `tudo`, `intervalo` + `de`/`ate`), `previa` (+ `key` de admin) | `periodo`, `periodos`, `numeros`, `mapa`, `aoVivo`, `atualizadoEm`; `ativo: false` se desligado; intervalo inválido: `ok: false`, `erro` | cache de 5 min; números < 3 suprimidos; grade ~11 km |

## Fora do doPost

Gatilhos, sem action: `encerrarTurnosAutomatico`, `backupDiario`, `arquivarAnosAntigos`, `relatorioMensal` ([modulos/rotinas.md](modulos/rotinas.md)).
