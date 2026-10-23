# Portabilidade: preparar o Code.gs para sair do Google

O porte para servidor próprio (Hono + PostgreSQL, repositório [Sistema_Adaf](https://github.com/Ronald614/Sistema_Adaf)) reescreve só o `Code.gs`, action por action, sobre o mesmo contrato de [API.md](API.md) e o mesmo `web/`. Escreva para o porte ser cópia, não reescrita.

## Camada de acesso
Toda chamada a serviço do Google (os nomes do grep abaixo) e todo `getRange`/`setValues`/`deleteRow` ficam na seção `/* ---------- Acesso ao Google (camada portátil) ---------- */` do `Code.gs`. O resto chama só estas funções.

Já existem: `lerLeitura_`, `lerLinhas_`, `inserir_`, `atualizar_`, `atualizarColuna_`, `gravar_`, `comLock_`, `hojeManaus_`, `tsManaus_`. As demais: crie na seção com este nome e acrescente aqui.

| Função | Apps Script | Sistema_Adaf |
|---|---|---|
| `lerLeitura_(nome)` | `SpreadsheetApp`, sem criar aba | `lerLeitura_` (`base.ts`) |
| `lerLinhas_(nome)` | objetos (`paraObjeto_`) com `_linha` | `lerTudo` (`dados.ts`) |
| `lerOnde_(nome, coluna, valor)` | filtro por coluna | `lerOnde` |
| `inserir_(nome, objs)` | acrescenta no fim | `inserir` |
| `atualizar_(nome, linha, campos)` | grava só as colunas informadas | `atualizar` |
| `atualizarColuna_(nome, coluna, linhas, valor)` | uma escrita na coluna | `atualizarVarios` |
| `apagar_(nome, linhas)` | `deleteRows`, de baixo para cima | `apagar` |
| `gravar_(nome, recebidos, ts, usuario)` | sync, "última edição vence" | `gravar_` (`base.ts`) |
| `comLock_(fn)` | `LockService`, `waitLock(30000)` | `comLock` |
| `prop_`, `setProp_`, `delProp_` | `PropertiesService` do script | `prop`, `setProp`, `delProp` |
| `cacheLer_`, `cacheGravar_(chave, valor, seg)`, `cacheApagar_` | `CacheService` | `cache.get`, `cache.put`, `cache.remove` |
| `gravarArquivo_(partes, nome, bytes, mime)` → id | `DriveApp`, pasta `partes` | `gravarArquivo` (`servicos.ts`) |
| `apagarArquivo_(id)` | `setTrashed(true)` | `apagarArquivo` |
| `linkArquivo_(id)` | `DriveApp`, link de qualquer pessoa | `linkArquivo` (assinado) |
| `enviarEmail_({ to, subject, htmlBody, body, name })` | `MailApp.sendEmail` | `enviarEmail` |
| `buscarJson_(url)` | `UrlFetchApp.fetch` + `JSON.parse` | `fetch` |
| `uuid_()` | `Utilities.getUuid()` | `uuid` |
| `sha256_(txt)` | `Utilities.computeDigest` (SHA-256) | `sha256Assinado` |
| `formatarData_(data, padrao)` | `Utilities.formatDate`, Manaus | `formatarData` |
| `base64Bytes_(txt)` | `Utilities.base64Decode` | `base64Decode` |
| `hojeManaus_()`, `tsManaus_(dia, hm)` | data de negócio em Manaus | os mesmos |

## Fora da camada (só existe no Google)
Em seções próprias, sem equivalente no porte:
- Menu (`onOpen`, `menu*`) → linha de comando (`server/scripts/egdv.ts`).
- Gatilhos (`ScriptApp`, `ativarRotinasAutomaticas_`) → rotinas agendadas.
- Backup em cópia, arquivo anual e formatação/conserto (`abaDe_`, `garantirColunas_`, `aproveitarCopia_`) → backup, particionamento, migrações SQL.
- `?p=painel` (`painelHtml_`): legado, não é portado.

Sem regra de negócio: a entrada chama função comum (`menuGerarCodigo` → `gerarCodigo_(nome)`).

## Regras para código novo
1. Regra de negócio não chama o Google (validação, numeração, apuração, relatório, resposta).
2. Por nome de coluna, nunca por posição (`linha[3]`, `getRange(r, 5)`).
3. Valide antes da primeira gravação no `comLock_`: no PostgreSQL um erro desfaz tudo; no Apps Script, o gravado fica.
4. `_linha` vale só no mesmo lock e antes de apagar.
5. Datas em texto ou milissegundos (`aaaa-mm-dd`, `HH:MM`, `Date.now()`); "hoje" é `hojeManaus_()`.
6. Nada fixo do Google: ID de planilha ou pasta, e-mail e URL vão em propriedade (`prop_`).
7. Cálculo separado da leitura: a apuração recebe as linhas por parâmetro (`motorBarreira_` ainda lê sozinho).
8. Resposta sem nada só do Google: link em `url`; `driveId` é só identificador (o front não monta URL com ele).
9. Nenhum serviço novo do Google sem necessidade: relatório se gera no front (`web/documentos/`); se for inevitável, vai à camada, a esta tabela e ao `fakegas.js`.
10. Login sem Google sempre disponível: `admCodigo` continua existindo.

## Migrar o código existente
Uma seção por PR, sem mudar comportamento:
1. Criar `prop_`, `setProp_`, `delProp_` e trocar as chamadas diretas a `PropertiesService` e `LockService`.
2. Seção por seção: Convênios, Relatório GDV, VIGIFITO, Portal do Administrativo; depois sync, TF, PCE.
3. Pronto = `node run.js` passa **sem mudar nenhum teste** (se um mudou, separe o PR).
4. Mude o `VERSAO_CODIGO`.

Ver o que falta:
```sh
grep -nE '\b(SpreadsheetApp|LockService|PropertiesService|CacheService|DriveApp|MailApp|UrlFetchApp|Utilities|Session|ScriptApp|HtmlService)\.|\.(getRange|setValues?|appendRow|deleteRows?|getLastRow)\(' apps-script/Code.gs
```

## Manter o porte
Action nova, removida ou com parâmetro novo: atualize o [API.md](API.md) no mesmo PR. Coluna nova em `TABELAS`: diga no PR (vira migração SQL). Mudança de sync, numeração ou permissão: descreva a regra no PR.
