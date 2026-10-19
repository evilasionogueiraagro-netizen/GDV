# API do e-GDV (apps-script/Code.gs)

Referência das actions do servidor. A fonte da verdade é o `doPost` do `Code.gs`; ao criar, mudar ou remover uma action,
atualize esta tabela.

## Protocolo

Um único endpoint (URL `/exec` do Web App, em `web/js/config.js`):

```
POST <url>/exec
Content-Type: text/plain;charset=utf-8          ← de propósito: evita o preflight de CORS
{ "action": "<nome>", ...parâmetros }

200 → { "ok": true, ... }                       sucesso
200 → { "ok": false, "erro": "<mensagem em português, mostrada ao usuário>" }
```

- O HTTP é sempre 200: o erro vem em `ok: false`. Em falta de permissão de módulo, a resposta traz também
  `semPermissao` e `permissoes` (o app atualiza o que guardou).
- `GET <url>/exec` → `{ ok, servico: 'e-GDV', versao: VERSAO_CODIGO }` (confere a versão publicada).
  `GET ?p=painel` → HTML do painel (legado; o painel atual roda no GitHub Pages).
- Clientes: `web/js/sync.js` e `web/js/envio.js` (app e service worker), `web/painel/js/painel.js` (`api`/`chamar`),
  `web/administrativo/js/adm.js`, `web/dashboard/js/dashboard.js`, `web/js/verificar.js`.

### Contrato independente do Google

Este contrato é o mesmo no Apps Script e no porte para servidor próprio ([PORTABILIDADE.md](PORTABILIDADE.md)). Ao criar
ou mudar uma action:

- Nada na requisição ou na resposta depende do Google. Link de arquivo vai em `url`, que o cliente abre sem interpretar;
  `driveId` é só o identificador do arquivo (fora do Google, o caminho dele). O cliente não monta URL do Drive.
- Nome de campo novo não cita "drive" nem "planilha" (`driveId` fica por compatibilidade).
- Datas em `aaaa-mm-dd`, `HH:MM` ou milissegundos; nunca objeto `Date` serializado.
- O cliente só conhece a URL base (`web/js/config.js`) e não depende do formato `script.google.com/.../exec`.

## Autenticação

| Tipo | Campo | Como se obtém | Validado por |
|---|---|---|---|
| Fiscal (aparelho) | `key` | `ativar` com código de 6 dígitos | `autenticar_` (+ `exigirModulo_` em TF/PCE) |
| Administrador (painel/TV) | `key` | `painelAtivar` com código de administrador, ou a chave mestra `ACCESS_KEY` | `adminDoToken_` |
| Portal do Administrativo | `sessao` | `admLogin` (Google) ou `admCodigo` | `admSessao_` (12 h sem uso expira) |
| Pública | — | — | limitador de taxa e cache próprios |

As credenciais ficam na aba `Fiscais` (coluna `perfil`: vazio = fiscal, `admin` = administrador); as sessões do portal
ficam na aba `AdmSessoes`, guardadas só como hash. Uma credencial nunca vale no lugar de outra: `key` de fiscal recebe
"Acesso restrito" no painel, e a `key` do painel não abre o portal.

Módulos (`veiculos`, `tf`, `pce`, mais a flag `antigo` para "digitar do papel") vêm da aba `Permissoes`; sem linha =
tudo liberado, exceto `antigo`. O mapa `MODULO_DA_ACAO` diz qual módulo cada action exige.

## App do fiscal (`key` de fiscal)

| Action | Módulo | Parâmetros | Resposta (além de `ok`) | Handler |
|---|---|---|---|---|
| `ativar` | — (sem `key`) | `codigo` | `nome`, `token` | `ativar_` |
| `ping` | — | `aparelho` | `nome`, `agora` | `ping_` |
| `sync` | por registro | `since`, `aparelho`, listas `turnos`, `veiculos`, `tfs`, `pessoas`, `placas`, `levantamentos`, `colheitas`, `propriedades`, `cadastrosPce`, `termosPce` (máx. 2.000 cada) | `agora`; as mudanças desde `since` das mesmas listas (só do próprio fiscal); `barreiras`, `ultimos`, `ultimosPce`, `ultimosDocPce`, `permissoes`, `recusados` | `sincronizar_` |
| `tfConsultar` | tf | `doc` (CPF/CNPJ) e/ou `placa` | `pessoa`, `placa`, `historicoDoc`, `historicoPlaca` | `consultar_` |
| `tfProximoNumero` | tf | `barreira`, `ano` | `ultimo`, `proximo` | `proximoNumero_` |
| `tfEmitir` | tf | `tf`, `pessoa`, `placa` | `emitido: true, numero, emitidoEm, srv_ts` ou `emitido: false, ocupadoPor` | `emitir_` |
| `tfAndamento` | tf | `rascunhoId`, `estado` (`preenchendo`/`fim`), `barreira`, `turnoId`, `placa`, `procedimento`, `local`, `lat`, `lon` | — | `tfAndamento_` |
| `tfIndiceReincidencia` | tf | `desde` | `agora`, `completo`, `itens` | `tfIndiceReincidencia_` |
| `pceProximoNumero` | pce | `unidade`, `ano` | `ultimo`, `proximo` | `pceProximoNumero_` |
| `pceEmitir` | pce | `colheita`, `pessoa`, `propriedade` | como `tfEmitir` (+ `numeroTxt`) | `pceEmitir_` |
| `pceConsultar` | pce | `doc` | propriedades e contagens do produtor | `pceConsultar_` |
| `pceDocNumero` | pce | `tipo` (`termo`/`cadastro`), `unidade`, `ano`, `programa` | `ultimo`, `proximo` | `pceDocNumero_` |
| `pceDocRegistrar` | pce | `tipo`, `registro`, `pessoa`, `propriedade` | como `pceEmitir` | `pceDocRegistrar_` |
| `pceBaixarMunicipio` | pce | `municipios` (lista) | `municipios`, `propriedades`, `pessoas`, `cadastrosPce` | `pceBaixarMunicipio_` |
| `arquivoEnviar` | tf se `arquivo.dono = 'tfs'`, senão pce | `arquivo` {`id` UUID, `dono`, `donoId`, `tipo` (`foto`/`assinatura`/`documento`), `papel`, `mime`, `rotulo`}, `base64` | `id`, `url`, `driveId`, `existente` | `arquivoEnviar_` |

Registros de módulo não liberado (ou `registroAntigo = 1` sem a flag `antigo`) não são gravados no `sync`: voltam em
`recusados` e ficam pendentes no aparelho.

## Painel do administrador (`key` de administrador)

| Action | Parâmetros | O que faz | Handler |
|---|---|---|---|
| `painelAtivar` | `codigo` | troca o código de administrador por `token` | `painelAtivar` |
| `painelSair` | — | revoga a credencial do painel | `painelSair` |
| `painelDados` | `de`, `ate`, `aoVivo`, `ids` | todos os dados do período (turnos, veículos, TFs, PCE, auditoria da numeração); `aoVivo` = só o que muda (modo TV) | `painelDados` |
| `painelGerarCodigo` | `nome`, `modulos` | gera código de ativação de fiscal | `painelGerarCodigo` |
| `painelAcessos` | `ocultos` | lista servidores e situação dos acessos | `painelAcessos` |
| `painelOcultarAcesso` / `painelRestaurarAcesso` | `nome` | esconde/mostra servidor sem acesso ativo | `painelOcultarAcesso` |
| `painelRevogar` | `nome` | revoga os acessos de um fiscal | `painelRevogar` |
| `painelRevogarAdmin` | `nome` | revoga os acessos de um administrador (painel e TV); recusa o próprio | `painelRevogarAdmin` |
| `painelPermissoes` | `nome`, `modulos` | grava os módulos liberados de um fiscal | `painelPermissoes` |
| `painelEncerrarTurno` | `turnoId`, `fim` (HH:MM) | encerra turno esquecido aberto | `painelEncerrarTurno` |
| `painelPceLaudo` | `id`, `laboratorio` | grava resultado laboratorial do Termo de Colheita | `painelPceLaudo` |
| `painelPublicoConfig` / `painelPublicoSalvar` | `config` | configuração do dashboard público | `painelPublicoConfig`, `painelPublicoSalvar` |
| `painelConvenios` | — | convênios, lançamentos, financeiro e relatórios | `painelConvenios` |
| `painelConvApuracao` | `convenio`, `de`, `ate` | apuração automática das metas | `painelConvApuracao` → `convApurar_` |
| `painelConvSalvar` | `convenio`, `config` | configuração do convênio | `painelConvSalvar` |
| `painelConvRelSalvar` | `convenio`, `mes`, `numero`, `textos` | textos do relatório mensal | `painelConvRelSalvar` |
| `painelRelGdv` | `ano` | textos e lançamentos do Relatório GDV | `painelRelGdv` |
| `painelRelGdvSalvar` | `tipo` (`mensal`/`anual`/`vigifito`), `ano`, `mes`, `textos` | salva textos (lançamentos: só pelo portal) | `painelRelGdvSalvar` |
| `painelRelGdvApuracao` | `de`, `ate`, `grupos` | apuração do Relatório GDV (até 1 ano) | `painelRelGdvApuracao` → `relGdvApurar_` |
| `painelVigDados` | `ano` | dados do VIGIFITO | `painelVigDados` → `vigDados_` |
| `painelVigConfigSalvar` | `config` | postos e escala do VIGIFITO | `painelVigConfigSalvar` |
| `painelAdmLista` | — | liberados do Portal do Administrativo | `painelAdmLista` |
| `painelAdmSalvar` | `id`, `nome`, `email`, `ativo` | libera/edita/revoga pessoa no portal | `painelAdmSalvar` |
| `painelAdmCodigo` | `id` | gera código de login do portal | `painelAdmCodigo` |

**Legado**: `painelConvLancar`, `painelConvExcluir`, `painelConvFinLancar`, `painelConvFinImportar` e
`painelConvFinExcluir` só respondem `MSG_PORTAL` (os lançamentos passaram para o portal). Podem sair quando nenhum
painel antigo estiver em uso.

## Portal do Administrativo (`sessao`)

Login sem sessão: `admLogin` (`idToken` do Google, conferido no tokeninfo; precisa da propriedade `GOOGLE_CLIENT_ID`)
e `admCodigo` (`codigo` gerado no painel; permanente: vale em todo login até o painel gerar outro para a pessoa ou revogar o acesso). Ambos devolvem `sessao`, `nome`, `email`, `expiraEm`, `origem`.

Toda action que começa com `adm` + maiúscula passa por `admAcao_` → mapa `ADM_ACOES_`, que exige `sessao`. Toda
gravação entra no histórico (aba `AdmHistorico`, com antes/depois).

| Action | Parâmetros | O que faz |
|---|---|---|
| `admSair` | — | encerra a sessão |
| `admDados` | — | dados iniciais do portal: convênios, servidores, lançamentos físicos e financeiros |
| `admConvLancar` / `admConvExcluir` | `lancamento` / `id` | execução física do convênio |
| `admConvFinLancar` / `admConvFinExcluir` | `lancamento` / `id` | execução financeira |
| `admConvFinImportar` | `convenio`, `arquivo`, `itens`, `excluir` (máx. 500 por chamada) | importa a planilha de movimentação |
| `admRelDados` / `admRelLancar` | `ano` / `ano`, `lancamentos` (máx. 3.000) | linhas manuais do Relatório GDV |
| `admVigDados` | `ano` | dados do VIGIFITO |
| `admVigLancar` / `admVigImportar` | `lancamentos` / `arquivo`, `itens` | valores manuais do VIGIFITO |
| `admHistorico` | `aba`, `registro` | últimas 300 alterações |

## Públicas (sem credencial)

| Action | Parâmetros | O que faz | Proteções |
|---|---|---|---|
| `tfVerificar` | `id` (UUID do TF) | autenticidade do TF (`verificar.html`, QR code) | placa mascarada; máx. 30 ids inválidos/min |
| `publicoDados` | `periodo`, `previa` (+ `key` de admin para pré-visualizar) | números agregados do dashboard público | cache de 5 min, limite de recálculos, números < 3 suprimidos, grade de ~11 km |

## Funções fora do `doPost`

Chamadas pelo menu da planilha (`onOpen` → `menu*`) ou por gatilhos de tempo: `encerrarTurnosAutomatico`,
`backupDiario`, `arquivarAnosAntigos`, `relatorioMensal`. Ativadas pelo menu **e-GDV → Ativar rotinas automáticas**.
