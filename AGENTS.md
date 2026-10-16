# e-GDV — guia para agentes e devs

Sistema da ADAF (defesa agropecuária do Amazonas) para barreiras fitossanitárias e vigilância de campo: app offline-first
dos fiscais, painel gerencial, Portal do Administrativo e dashboard público. Português em tudo: código, comentários, commits e UI.

## Arquitetura

```
web/ (HTML/JS/CSS puro, sem build)  ──POST JSON──►  apps-script/Code.gs  ──►  Planilha Google (uma aba por tabela)
publicado no GitHub Pages                            Web App do Apps Script     + Drive (fotos/PDFs/backups)
```

- **Front** (`web/`): app do fiscal (`index.html`, `js/`; IndexedDB + `sw.js` com Background Sync), painel (`painel/`),
  portal (`administrativo/`), dashboard público (`dashboard/`), modelos de documento (`documentos/`), `verificar.html`.
- **Back** (`apps-script/Code.gs`, arquivo único ~4.900 linhas): um endpoint, `doPost`, que despacha por `req.action`.
  Contrato completo em [docs/API.md](docs/API.md). Seções marcadas com `/* ---------- Título ---------- */`.
- **Banco**: `TABELAS` (topo do `Code.gs`) define cada aba e suas colunas. Células em texto puro (`'@'`).
- **Testes** (`tests/`): `fakegas.js` roda o `Code.gs` **real** no Node com serviços Google falsos; testes E2E no
  Chromium (playwright-core). Detalhes em [tests/README.md](tests/README.md).
- **Porte em andamento**: o back está sendo reimplementado fora do Google (Hono + PostgreSQL, repositório Sistema_Adaf),
  com o mesmo contrato e o mesmo `web/`. O Apps Script continua sendo a produção. Todo código novo no `Code.gs` segue
  [docs/PORTABILIDADE.md](docs/PORTABILIDADE.md) para o porte ser cópia, não reescrita.

## Regras que não podem ser quebradas

- **Colunas**: coluna nova só no **fim** do array em `TABELAS`. Nunca renomear, reordenar ou remover coluna
  (`garantirColunas_` migra planilhas antigas acrescentando no fim; os dados ficam por posição).
- **`VERSAO_CODIGO`** (`Code.gs`, perto do `doGet`): mudar a cada alteração do `Code.gs` (formato `AAAA-MM-DDx`). É como
  se confere qual versão está publicada (`GET /exec`).
- **Gravações concorrentes** usam o lock do script (`comLock_`, que embrulha `LockService.getScriptLock()`; código antigo
  ainda chama o `LockService` direto). Leitura sem efeito colateral usa `lerLeitura_` (não cria aba nem coluna).
  Numeração (TF, PCE) sempre dentro do lock. Valide tudo antes da primeira gravação dentro do lock.
- **Google só na camada de acesso**: regra de negócio não chama `SpreadsheetApp`, `LockService`, `PropertiesService`,
  `CacheService`, `DriveApp`, `MailApp`, `UrlFetchApp`, `Utilities` nem `getRange`/`setValues`. Use as funções da seção
  "Acesso ao Google (camada portátil)"; se a que você precisa não existe, crie-a lá com o nome de
  [docs/PORTABILIDADE.md](docs/PORTABILIDADE.md). Leia e grave por nome de coluna, nunca por posição. Código antigo fora
  da regra: migre só a seção que você já está mexendo, em PR separado, sem mudar comportamento.
- **Menu e gatilhos sem regra de negócio**: `menu*`, `onOpen` e as rotinas de gatilho só colhem a entrada e chamam uma
  função comum (ex.: `menuGerarCodigo` → `gerarCodigo_(nome)`). Nenhum serviço novo do Google (Docs, Sheets API, Forms…)
  sem combinar antes.
- **Sync**: "última edição vence" por `atualizadoEm`, com exceções explícitas em `gravar_` (turno encerrado não reabre;
  laudo de laboratório mais novo é preservado). `srv_ts` e `usuario` são definidos pelo servidor, nunca pelo app.
- **Excluir** é lógico (`excluido = 1`); nada é apagado da planilha.
- **Permissões**: actions de TF/PCE passam por `exigirModulo_` (mapa `MODULO_DA_ACAO`); registros de módulo não
  liberado voltam em `recusados`. Painel = credencial de perfil `admin` (`adminDoToken_`); portal = sessão própria
  (`admSessao_`) — uma credencial nunca vale no lugar da outra.
- **LGPD**: nada público expõe CPF, nome completo, placa inteira ou coordenada exata (dashboard e `verificar.html`
  mascaram). Os testes conferem isso; não afrouxe.
- **Fuso**: datas de negócio em `America/Manaus` (UTC−4). Use `hojeManaus_()`, `tsManaus_()`; nada de `new Date()` cru
  para "hoje".
- **Front offline**: arquivo novo em `web/` que o app ou o painel precisem sem internet entra na lista `ARQUIVOS` de
  `web/sw.js` ou `web/painel/sw.js`. Não mexa em `VERSAO`/`VERSAO_APP` (o workflow troca pelo hash do commit).
- **Sem dependências de CDN** no app de campo: bibliotecas ficam vendorizadas em `web/vendor/` ou `web/painel/vendor/`.

## Testes

```sh
cd tests && npm ci && npx playwright-core install chromium   # uma vez
node run.js                     # suíte inteira (~10 min)
node run.js painel_test tf_e2e  # só alguns
node run.js --lista             # nomes disponíveis
```

`*_server_test.js` só falam HTTP com o fakegas (rápidos). Mudou uma action → rode o teste da área (os nomes seguem o
módulo: `tf_*`, `pce_*`, `convenio_test`, `vigifito_test`, `adm_test`, `publico_test`, `permissoes_test`…). Serviço
Google novo usado no `Code.gs` precisa existir no `fakegas.js` (e entra só pela camada de acesso). Teste novo: ver
"Escrever um teste novo" em `tests/README.md`; prefira conferir pelas actions (HTTP), que é o que o porte também roda.
PR que só migra código para a camada de acesso passa na suíte inteira sem mudar nenhum teste.

## Conta Google do sistema

Desde 2026-10-15 a planilha, o Apps Script, o Drive (pastas `GDV - Arquivos`, `GDV - Backups`, `GDV - Arquivo anual`) e o
relatório mensal pertencem à conta **adafegdv@gmail.com**. O código não fixa e-mail nenhum: tudo segue a conta dona do script
(`Session.getEffectiveUser()`, `DriveApp`). Não coloque e-mails, IDs de planilha ou de pasta fixos no código; vão nas
propriedades do script (ex.: `RELATORIO_EMAILS`, pelo menu da planilha). Fotos/PDFs enviados antes dessa data ficaram no
Drive da conta anterior.

## Publicação (dois caminhos separados)

1. **Front**: merge na `main` com mudança em `web/**` → `.github/workflows/pages.yml` publica no GitHub Pages
   **direto em produção** (os celulares atualizam ao abrir). Trabalhe em branch e abra PR.
2. **Back**: `.github/workflows/apps-script.yml` publica sozinho com o clasp depois que os testes passam na `main`, na
   implantação atual (a URL `/exec` em `web/js/config.js` não muda). **Só publica se o `VERSAO_CODIGO` mudou.** Entra uns
   10 minutos depois do front: se o front depende de action ou coluna nova, ele precisa aguentar o back antigo nesse
   intervalo (ou mande o back antes, em PR próprio). Não edite código no editor do Apps Script (a publicação seguinte
   sobrescreve). Configuração, serviço novo do Google e como voltar versão: [docs/PUBLICACAO-BACK.md](docs/PUBLICACAO-BACK.md).
   Enquanto os segredos do ambiente `apps-script` não estiverem configurados, o workflow falha e a publicação é manual:
   colar o `Code.gs` → Implantar → Gerenciar implantações → editar a implantação atual → Nova versão.

O CI de testes (`testes.yml`) roda em push/PR para `main` e `claude/**`.

## Onde achar contexto

- [README.md](README.md): manual funcional completo (~140 KB). **Não leia inteiro**: liste as seções com
  `grep -n '^#' README.md` e leia só a do módulo em questão.
- [docs/API.md](docs/API.md): todas as actions, autenticação, parâmetros e respostas.
- [docs/IDEIAS.md](docs/IDEIAS.md): ideias combinadas com a gerência e ainda não feitas, com as decisões já tomadas.
- [docs/MIGRACAO.md](docs/MIGRACAO.md): passar planilha e script para a conta institucional.
- [docs/PORTABILIDADE.md](docs/PORTABILIDADE.md): camada de acesso ao Google, o que fica fora dela e regras para o
  `Code.gs` ser portado para servidor próprio.
- [docs/PUBLICACAO-BACK.md](docs/PUBLICACAO-BACK.md): publicação automática do Apps Script (clasp) e como configurar.
- Propriedades do script (`PropertiesService`): `SHEET_ID`, `ACCESS_KEY`, `GOOGLE_CLIENT_ID`, `ADM_MAX`, `ADM_URL`,
  `PAINEL_URL`, `PUBLICO_URL`, `RELATORIO_EMAILS`, `ROTINAS_DESATIVADAS`, entre outras — `grep -n getProperty` no `Code.gs`.
