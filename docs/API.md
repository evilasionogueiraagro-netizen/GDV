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
| **Conta única** (app, painel e portal) | `key` (app/painel) ou `sessao` (portal): token da sessão | `entrar` com o código de acesso | `usuarioDaSessao_(token, escopo)` dentro de `autenticar_` (app, perfil fiscal), `adminDoToken_` (painel, gerente) e `admSessao_` (portal, administrativo); `dev` vale para tudo |
| Fiscal (aparelho) | `key` | `ativar` com código de 6 dígitos | `autenticar_` (+ `exigirModulo_` em TF/PCE) |
| Administrador (painel/TV) | `key` | `painelAtivar` com código de administrador, ou a chave mestra `ACCESS_KEY` | `adminDoToken_` |
| Portal do Administrativo | `sessao` | `admLogin` (Google) ou `admCodigo` | `admSessao_` (30 dias sem uso expira) |
| Pública | — | — | limitador de taxa e cache próprios |

**Conta única** (aba `Usuarios`, sessões na aba `Sessoes`): uma conta por pessoa, com perfis (`fiscal`, `administrativo`,
`gerente`, `dev`) e os módulos do fiscal. O código de acesso tem 6 dígitos, não expira e vale até o gerente gerar outro ou revogar;
na planilha fica só o hash (com o segredo `CODIGO_SEGREDO` das propriedades do script). Controle de acesso por app: o perfil decide o
que a pessoa abre e a sessão vale só no app em que foi aberta (`escopo`). Revogar a conta derruba as sessões de todos os aparelhos.

| Action | Credencial | Parâmetros | Resposta |
|---|---|---|---|
| `entrar` | — | `codigo`, `escopo` (`app`, `painel` ou `portal`), `aparelho` | `token` (e `sessao` no portal), `nome`, `perfis`, `modulos`, `conta: true`. Código que não é de conta: tenta o código antigo daquele app (`ativar`, `painelAtivar`, `admCodigo`). 20 códigos errados no sistema em 15 min bloqueiam a entrada por código |
| `sair` | `key` | — | `saiu` |
| `painelUsuarios` | gerente | — | `usuarios` (sem hash; `temCodigo`, `aparelhos` com `escopo` e `ultimoUso`), `perfis` |
| `painelUsuarioSalvar` | gerente | `id?`, `nome`, `perfis`, `modulos`, `ativo?` | `usuario`, `novo`, `codigo` (só na conta nova, uma vez). Nome único; ninguém tira o próprio acesso de gerente; gerente e dev só com conta de gerente; dev só por dev |
| `painelUsuarioCodigo` | gerente | `id`, `revogarAparelhos?` | `codigo` novo (o anterior para de valer) |
| `painelSessaoRevogar` | gerente | `id` (da sessão) | — (tira um aparelho) |
| `painelUsuariosImportar` | gerente | — | `criados`, `atualizados`: contas a partir das abas `Fiscais` e `Administrativo` (a mesma pessoa vira uma conta), sem código |

Credenciais antigas (códigos de 6 dígitos), que continuam valendo até cada pessoa receber o código da conta:
as credenciais ficam na aba `Fiscais` (coluna `perfil`: vazio = fiscal, `admin` = administrador); as sessões do portal
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
| `pceConsultar` | pce | `doc` | `pessoa`, `propriedades` (com `cnpj`, `empresa`, `endereco`, `uf`, `viaAcesso`, `comercial`, `tipoPropriedade`), contagens e `cadastrosPce` do produtor | `pceConsultar_` |
| `pceDocNumero` | pce | `tipo` (`termo`/`cadastro`), `unidade`, `ano`, `programa` | `ultimo`, `proximo` | `pceDocNumero_` |
| `pceDocRegistrar` | pce | `tipo`, `registro`, `pessoa`, `propriedade` | como `pceEmitir` | `pceDocRegistrar_` |
| `pceBaixarMunicipio` | pce | `municipios` (lista) | `municipios`, `propriedades`, `pessoas`, `cadastrosPce` | `pceBaixarMunicipio_` |
| `arquivoEnviar` | tf se `arquivo.dono = 'tfs'`, senão pce | `arquivo` {`id` UUID, `dono`, `donoId`, `tipo` (`foto`/`assinatura`/`documento`), `papel`, `mime`, `rotulo`}, `base64` | `id`, `url`, `driveId`, `existente` | `arquivoEnviar_` |

Registros de módulo não liberado (ou `registroAntigo = 1` sem a flag `antigo`) não são gravados no `sync`: voltam em
`recusados` e ficam pendentes no aparelho.

Levantamento (`levantamentos[]`), campo **`citros`** (coluna `citros` da aba `Levantamentos`): bloco "Cultura do citros" do cadastro de cítricos
(IN 21/2018, Portaria 317/2021), preenchido só quando o levantamento tem praga de citros; senão `''`. Texto JSON
`{v: 1, comercial, naoComercial, naoComercialOutros, atividades[], atividadeOutros, situacao, situacaoOutras,
culturas: [{atividade, cultivar, area, idade, plantas, producao}], entrega, formasEntrega[], compradores[], compradorOutros, beneficia,
beneficiaTipo, materiais[], origemMaterial, delimitacao: {pintapreta: {tem, tempo, controle, qual}}, deteccao: {hlb|acaro|cancro: {tem, tempo}},
rt: {nome, conselho}}` (sim/não = `'sim'`/`'nao'`; na detecção `'sim'` = presença e `'nao'` = ausência de sintomas, obrigatória no app para as três;
códigos das opções em `CONFIG.PCE.citros` e `CITROS_` no `Code.gs`). O servidor normaliza antes de gravar (`citrosTexto_`): só chaves e opções
conhecidas, textos até 200 caracteres, números ≥ 0 (negativo/inválido = vazio; `idade` e `plantas` inteiros), no máximo 20 linhas em `culturas`;
`cnpj`/`endereco`/`uf` (app da versão anterior) só se vierem preenchidos (`cnpj` 14 dígitos, `uf` 2 letras); JSON inválido ou sem nada = `''`.
Campos **`cnpj`**, **`empresa`**, **`endereco`** e **`uf`** (colunas no fim de `Levantamentos`, servidor 2026-10-20a+): identificação do
produtor/propriedade; o servidor normaliza (`identLev_`: CNPJ só dígitos com 14 ou `''`, UF 2 letras, empresa ≤ 120 e endereço ≤ 200 caracteres).
`Propriedades` ganha **`empresa`** no fim. Cadastro de citros: `CadastrosPCE` com `programa = 'citros'` (sequência própria por unidade/ano) e
`dados` = o JSON acima + `levantamentoId`, `codigoPropriedade`, `endereco`, `telefone`, `email`, `empresa`, `culturasAvaliadas[]`, `amostra`.
Termo de Fiscalização de citros: `TermosPCE` com `programa = 'citros'`, `tipoLocal` = `["<local especificado>"]` e `constatacao` com as frases de
ausência/presença.
Registro enviado sem o campo mantém o valor da planilha (como as demais colunas).

TF (`tfs[]` no `sync` e `tf` no `tfEmitir`) e veículo (`veiculos[]`), campos **`ufOrigem`** e **`ufDestino`** (colunas no fim das abas
`TFs` e `Veiculos`): UF de origem/destino, opcional — sigla de `CONFIG.ufs` (`UFS_` no `Code.gs`: as 27 UFs e `Exterior`). O servidor normaliza
(`ufNorm_`: maiúscula; desconhecida = `''`); campo não enviado mantém o valor da planilha. No TF elas acompanham o texto livre de `origem`/`destino`;
TF antigo sem a coluna: o VIGIFITO e o `painelDados` usam a sigla do fim do texto (`ufDoTexto_`, ex.: "PORTO VELHO/RO" → `RO`) e, sem ela, a do
veículo ligado (`veiculoId`, só no VIGIFITO). O app não envia mais os campos antigos de fiscalização do veículo (`semEducacao`, `medidaFito`,
`carga`, `produtos`, `partida`, `inspecaoFito`, `docConferido`); ao editar um registro antigo, reenvia os valores que ele já tinha. Esses
campos ficam na planilha como histórico e não entram em nenhum indicador.

## Painel do administrador (`key` de administrador)

| Action | Parâmetros | O que faz | Handler |
|---|---|---|---|
| `painelAtivar` | `codigo` | troca o código de administrador por `token` | `painelAtivar` |
| `painelSair` | — | revoga a credencial do painel | `painelSair` |
| `painelDados` | `de`, `ate`, `aoVivo`, `ids` | todos os dados do período (turnos, veículos, TFs, PCE, auditoria da numeração); `aoVivo` = só o que muda (modo TV) | `painelDados` |
| `painelGerarCodigo` | `nome`, `modulos` | gera código de ativação de fiscal | `painelGerarCodigo` |
| `painelAcessos` | `ocultos` | lista servidores e situação dos acessos; `oculto = 1` (fiscal ou administrador) só com `ocultos: true`; resposta traz `ocultarAdmin: true` | `painelAcessos` |
| `painelOcultarAcesso` / `painelRestaurarAcesso` | `nome`, `perfil` | esconde/mostra servidor sem acesso ativo nem código aguardando (`oculto`/`ocultoPor`/`ocultoEm` na aba `Fiscais`; nada é apagado); sem `perfil` = linhas de fiscal, `perfil: 'admin'` = de administrador (recusa o próprio acesso) | `painelOcultarAcesso` |
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
| `painelAdmLista` | `ocultos` | liberados do Portal do Administrativo; removidos (`oculto = 1`) só com `ocultos: true` (vêm com `oculto: 1`, `ocultoPor`, `ocultoEm`); resposta traz `ocultar: true` | `painelAdmLista` |
| `painelAdmSalvar` | `id`, `nome`, `email`, `ativo` | libera/edita/revoga pessoa no portal; `ativo = 1` também desfaz o "Remover" (`oculto = 0`) | `painelAdmSalvar` |
| `painelAdmCodigo` | `id` | gera código de login do portal | `painelAdmCodigo` |
| `painelAdmOcultar` | `id`, `restaurar` | "Remover" (só liberado revogado, `ativo = 0`) → `oculto = 1`, `ocultoPor`, `ocultoEm` na aba `Administrativo` (nada é apagado); `restaurar: true` → `oculto = 0` (mantém `ocultoPor`/`ocultoEm`). Resposta `{ok, id, nome, oculto}` | `painelAdmOcultar` |

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
| `admConvFinLancar` / `admConvFinExcluir` | `lancamento` (com `municipio` opcional) / `id` | execução financeira |
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
