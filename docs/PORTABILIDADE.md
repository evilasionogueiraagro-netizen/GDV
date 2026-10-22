# Portabilidade: preparar o Code.gs para sair do Google

Hoje o e-GDV roda no Google: o back é o Apps Script e os dados ficam em planilha e no Drive. Em paralelo, há um porte do
back para um servidor próprio (Hono + PostgreSQL em Docker), no repositório
[Sistema_Adaf](https://github.com/Ronald614/Sistema_Adaf). No porte, o front de `web/` fica igual e só o `Code.gs` é
reescrito, action por action, sobre o mesmo contrato ([API.md](API.md)).

Cada mudança no `Code.gs` vira trabalho de porte. Este documento diz como escrever o `Code.gs` para esse trabalho ser
pequeno **sem mudar nada no funcionamento atual**: o Apps Script continua sendo a produção até o porte ficar pronto.

## O que não muda

- O contrato do `doPost`: nomes das actions, parâmetros, respostas, `ok`/`erro`.
- `TABELAS`, as colunas e a regra de coluna nova só no fim.
- A planilha, o Drive, as propriedades do script e a publicação (front pelo Pages, back colado à mão).
- O front e os testes.

O que muda é **onde** o código chama o Google: só numa seção própria, a camada de acesso.

## A camada de acesso

Toda chamada a serviço do Google (`SpreadsheetApp`, `LockService`, `PropertiesService`, `CacheService`, `DriveApp`,
`MailApp`, `UrlFetchApp`, `Utilities`, `Session`) e todo `getRange`/`setValues`/`deleteRow` ficam na seção
`/* ---------- Acesso ao Google (camada portátil) ---------- */`, no fim do `Code.gs`, junto da seção `Planilha`. O resto do
arquivo chama só as funções dessa seção.

A seção cresce aos poucos: quem precisar de uma função que ainda não existe cria a função ali, com o nome da tabela
abaixo. Os nomes seguem as funções que o porte já tem em `server/egdv/` do Sistema_Adaf, para a troca ser direta.

| Função da camada | O que faz no Apps Script | No Sistema_Adaf (`server/egdv/`) |
|---|---|---|
| `lerLeitura_(nome)` (já existe) | linhas da aba como objetos, sem criar aba nem coluna | `lerLeitura_` (`base.ts`) |
| `lerLinhas_(nome)` | linhas como objetos (`paraObjeto_`) com `_linha` = número da linha na planilha | `lerTudo` (`dados.ts`) |
| `lerOnde_(nome, coluna, valor)` | linhas em que `coluna = valor` | `lerOnde` |
| `inserir_(nome, objs)` | acrescenta no fim da aba; coluna ausente fica vazia | `inserir` |
| `atualizar_(nome, linha, campos)` | grava só as colunas informadas da linha | `atualizar` |
| `atualizarColuna_(nome, coluna, linhas, valor)` | grava o mesmo valor numa coluna de várias linhas (uma escrita só; ex.: excluir os veículos de uma importação substituída) | `atualizarVarios` |
| `apagar_(nome, linhas)` | `deleteRows`, de baixo para cima (hoje só o arquivamento anual apaga linha; o resto é exclusão lógica) | `apagar` |
| `gravar_(nome, recebidos, ts, usuario)` (já existe) | sync com "última edição vence" | `gravar_` (`base.ts`) |
| `comLock_(fn)` | `getScriptLock().waitLock(30000)`, roda `fn`, `releaseLock()` no `finally` | `comLock` |
| `prop_(chave)`, `setProp_(chave, valor)`, `delProp_(chave)` | `PropertiesService.getScriptProperties()` | `prop`, `setProp`, `delProp` |
| `cacheLer_(chave)`, `cacheGravar_(chave, valor, seg)`, `cacheApagar_(chave)` | `CacheService.getScriptCache()` | `cache.get`, `cache.put`, `cache.remove` |
| `gravarArquivo_(partes, nome, bytes, mime)` → id | cria o arquivo na pasta `partes` dentro de `GDV - Arquivos` | `gravarArquivo` (`servicos.ts`) |
| `apagarArquivo_(id)` | `setTrashed(true)` | `apagarArquivo` |
| `linkArquivo_(id)` | link do Drive ("qualquer pessoa com o link") | `linkArquivo` (link assinado) |
| `enviarEmail_({ to, subject, htmlBody, body, name })` | `MailApp.sendEmail` | `enviarEmail` |
| `buscarJson_(url)` | `UrlFetchApp.fetch` + `JSON.parse` (hoje só o tokeninfo do login Google do portal) | `fetch` |
| `uuid_()` | `Utilities.getUuid()` | `uuid` |
| `sha256_(txt)` | `Utilities.computeDigest(SHA_256, txt, UTF_8)` | `sha256Assinado` |
| `formatarData_(data, padrao)` | `Utilities.formatDate(data, 'America/Manaus', padrao)` | `formatarData` |
| `base64Bytes_(txt)` | `Utilities.base64Decode` | `base64Decode` |
| `hojeManaus_()`, `tsManaus_(dia, hm)` (já existem) | data de negócio em Manaus | os mesmos |

Ao criar uma função que não está na tabela, acrescente a linha aqui.

## O que fica fora da camada (só existe no Google)

Estas partes não têm equivalente direto fora do Google e ficam em seções próprias, como estão hoje:

- **Menu da planilha** (`onOpen`, `menu*`): no Sistema_Adaf, é o script de linha de comando (`server/scripts/egdv.ts`).
- **Gatilhos de tempo** (`ScriptApp`, `ativarRotinasAutomaticas_`): no Sistema_Adaf, são rotinas agendadas no servidor.
- **Backup em cópia da planilha** e **arquivo anual em planilha separada**: no Sistema_Adaf, são backup e particionamento do
  banco.
- **Formatação e conserto da planilha** (`abaDe_`, `garantirColunas_`, `aproveitarCopia_`): no banco, viram migrações SQL.
- **`?p=painel`** (`painelHtml_`, `HtmlService`): legado; não é portado.

Regra para essas seções: **sem regra de negócio dentro**. O menu ou o gatilho só pega a entrada (caixa de diálogo,
horário) e chama uma função comum, que usa a camada. Ex.: `menuGerarCodigo` pede o nome pela UI e chama `gerarCodigo_(nome)`;
o porte reaproveita `gerarCodigo_` e troca só a UI.

## Regras para código novo (e para o código que você mexer)

1. **Regra de negócio não chama o Google.** Validação, numeração, apuração, relatórios e montagem de resposta usam só a
   camada.
2. **Por nome de coluna, nunca por posição.** Leia e grave objetos (`lerLinhas_`, `atualizar_`). Nada de `linha[3]`,
   `getRange(r, 5)` ou `cols.indexOf(...)` fora da camada.
3. **Valide tudo antes da primeira gravação dentro do `comLock_`.** No PostgreSQL, um erro desfaz tudo o que foi gravado
   dentro do lock; no Apps Script, o que já foi gravado fica. Validando antes, os dois se comportam igual.
4. **Número de linha só vale dentro do mesmo lock e antes de apagar.** Na planilha, `apagar_` faz as linhas de baixo
   subirem; no banco, não. Não guarde `_linha` em lugar nenhum nem use depois de apagar.
5. **Datas como texto ou milissegundos.** `aaaa-mm-dd`, `HH:MM` ou `Date.now()`; "hoje" com `hojeManaus_()`. Não dependa de
   objeto `Date` vindo da planilha (o `paraObjeto_` já converte).
6. **Nada fixo do Google no código.** ID de planilha, ID de pasta, e-mail e URL ficam em propriedade do script (`prop_`).
7. **Cálculo separado da leitura.** Funções de apuração e indicadores recebem as linhas por parâmetro; quem lê é o handler
   da action. Assim a função passa para o porte sem mudança. Hoje o `motorBarreira_` lê as abas por conta própria: ao
   mexer nele, separe a leitura (`lerLeitura_`) do cálculo.
8. **Resposta sem nada que só faça sentido no Google.** Link de arquivo vai em `url`, que o front abre sem interpretar.
   `driveId` é só o identificador do arquivo (no servidor próprio, o caminho dele): o front guarda, mas não monta URL do
   Drive com ele. Resposta nova não ganha campo com "drive" ou "planilha" no nome.
9. **Nenhum serviço novo do Google sem necessidade** (Docs, Sheets API, Forms, Calendar, Gmail avançado). Relatório se
   gera no front (`web/documentos/`), como hoje. Se o serviço for inevitável, ele entra na camada, nesta tabela e no
   `fakegas.js`.
10. **Login sem Google sempre disponível.** O portal aceita login com Google (`admLogin`), mas `admCodigo` continua
    existindo; não crie fluxo que só funcione com conta Google.

## Migrar o código que já existe

Aos poucos, uma seção por PR, **sem mudar comportamento**:

1. Criar a seção da camada com `comLock_` e `prop_`/`setProp_`/`delProp_` (são as chamadas mais espalhadas: 33 e 27).
2. Trocar seção por seção. Prioridade: o que mais muda (Convênios, Relatório GDV, VIGIFITO, Portal do Administrativo),
   depois sync, TF e PCE.
3. Critério de pronto: a suíte inteira passa (`node run.js`) **sem mudar nenhum teste**. Se um teste precisou mudar, o PR
   mudou comportamento: separe essa mudança em outro PR.
4. `VERSAO_CODIGO` muda como em qualquer alteração do `Code.gs`.

Para ver o que ainda falta, liste as chamadas ao Google e confira que todas estão na camada ou nas seções da lista acima:

```sh
grep -nE '\b(SpreadsheetApp|LockService|PropertiesService|CacheService|DriveApp|MailApp|UrlFetchApp|Utilities|Session|ScriptApp|HtmlService)\.|\.(getRange|setValues?|appendRow|deleteRows?|getLastRow)\(' apps-script/Code.gs
```

## Manter o porte em dia

O porte segue o `git log` e o [API.md](API.md). Por isso:

- Action nova, removida ou com parâmetro novo: atualize o [API.md](API.md) no mesmo PR (já é regra).
- Coluna nova em `TABELAS`: diga no texto do PR; no porte, ela vira uma migração SQL.
- Mudança de regra de sync, numeração ou permissão: descreva a regra no PR, não só "corrige X". É o que o porte reimplementa.
