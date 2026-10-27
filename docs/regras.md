# Regras do projeto

Valem para todo código, teste, doc e commit. Resumo de uma linha de cada no [AGENTS.md](../AGENTS.md).

## Banco (planilha)

- **Colunas**: coluna nova só no **fim** do array em `TABELAS` (`Code.gs`). Nunca renomear, reordenar nem remover
  (`garantirColunas_` acrescenta no fim das planilhas antigas; os dados ficam por posição). Células em texto puro (`'@'`).
- **Excluir é lógico** (`excluido = 1`). Nada é apagado da planilha.
- **Sync**: "última edição vence" por `atualizadoEm`, com as exceções explícitas em `gravar_` (turno encerrado não
  reabre; laudo de laboratório mais novo é preservado). `srv_ts` e `usuario` são do servidor, nunca do app.
- **Concorrência**: gravação usa o lock do script (`comLock_`). Leitura sem efeito colateral usa `lerLeitura_` (não cria
  aba nem coluna). Numeração (TF, PCE) sempre dentro do lock. Valide tudo antes da primeira gravação dentro do lock.

## Back (`Code.gs`)

- **`VERSAO_CODIGO`** (perto do `doGet`): mude a cada alteração do `Code.gs` (formato `AAAA-MM-DDx`). O back só é
  publicado se ela mudar; `GET /exec` mostra a versão no ar.
- **Google só na camada de acesso**: regra de negócio não chama `SpreadsheetApp`, `LockService`, `PropertiesService`,
  `CacheService`, `DriveApp`, `MailApp`, `UrlFetchApp`, `Utilities` nem `getRange`/`setValues`. Use (ou crie) a função
  da seção "Acesso ao Google (camada portátil)" com o nome de [PORTABILIDADE.md](PORTABILIDADE.md). Leia e grave por
  nome de coluna. Código antigo fora da regra: migre só a seção que você está mexendo, em PR separado, sem mudar
  comportamento.
- **Menu e gatilhos sem regra de negócio**: `menu*`, `onOpen` e rotinas só colhem a entrada e chamam uma função comum
  (ex.: `menuGerarCodigo` chama `gerarCodigo_(nome)`). Nenhum serviço novo do Google sem combinar antes.
- **Permissões (hoje)**: actions de TF/PCE passam por `exigirModulo_` (`MODULO_DA_ACAO`); registro de módulo não
  liberado volta em `recusados`. Painel = credencial `admin` (`adminDoToken_`); portal = sessão própria
  (`admSessao_`); uma nunca vale no lugar da outra. O modelo novo está em [decisoes/acesso.md](decisoes/acesso.md).
- **Vários `.gs`, um escopo global**: cada área no seu arquivo. Nada no topo de um arquivo pode depender, ao carregar,
  de outro arquivo (mapas de funções viram função que monta o mapa na chamada); `ordem_arquivos_test` confere.
- **Fuso**: datas de negócio em `America/Manaus` (UTC-4): `hojeManaus_()`, `tsManaus_()`, nunca `new Date()` cru.
- **Sem e-mail, ID de planilha ou de pasta fixos no código**: vão nas propriedades do script (`grep -n getProperty`).
  A planilha, o script e o Drive são da conta `adafegdv@gmail.com` desde 15/10/2026; o código segue a conta dona do
  script.

## Front (`web/`)

- Arquivo novo que o app ou o painel precisam sem internet entra em `ARQUIVOS` de `web/sw.js` ou `web/painel/sw.js`.
  Não mexa em `VERSAO`/`VERSAO_APP` (o workflow troca pelo hash do commit).
- Sem CDN no app de campo: bibliotecas em `web/vendor/` ou `web/painel/vendor/`.
- Sem emoji na interface: ícones vêm de `web/js/icones.js`.

## Dados pessoais (LGPD)

- **Repositório público**: só dados fictícios (nome "Fulano Ficticio Teste", CPF 529.982.247-25, placa ABC1D23) em
  código, testes, docs e commits. Planilhas reais ficam fora do repositório. O que entra no git não sai mais.
- Nada público expõe CPF, nome completo, placa inteira ou coordenada exata (dashboard e `verificar.html` mascaram).
  Os testes conferem; não afrouxe.
- Toda ação que muda dado ou acesso registra quem fez (rastreabilidade, LGPD art. 37).
- Leitura de dado pessoal (`painelDados`, `pce*` de consulta, `admDados`, listas de usuários) passa por `lido_` e vai
  para `AcessosADados` (uma linha por usuário e action por hora, sem o dado lido).

## Segurança (testes de invasão: `invasao_test`, `invasao_xss_test`)

- Registro com dono (`ABAS_COM_DONO_`: TFs, veículos, levantamentos, colheitas, termos do PCE) só é alterado por quem o
  gravou; o `sync` devolve os outros em `recusados`. Veículo entra no turno de outro login só para quem entrou nele
  pelo código. Pessoas, placas, propriedades e cadastros do PCE são comuns.
- Nome de usuário é único (também entre desativados): os registros se ligam ao nome.
- Texto que vai à planilha passa por `textoPlanilha_` (início `= + - @` ganha `'`; a leitura tira). Grave por
  `inserir_`/`atualizar_`/`gravar_`. No front, todo dado vai por `esc()` antes de `innerHTML`.
- Turno novo: `colegas` e `encerradoPor` só o servidor grava. Erro devolvido nunca traz detalhe do JavaScript.

## Publicação

- **Front**: merge na `main` com mudança em `web/**` publica no GitHub Pages, direto em produção. Sempre branch + PR.
- **Back**: depois dos testes na `main`, `apps-script.yml` publica com o clasp (se `VERSAO_CODIGO` mudou), uns 10 min
  depois do front. Front que depende de action ou coluna nova precisa aguentar o back antigo nesse intervalo (ou mande
  o back antes, em PR próprio). Nunca edite no editor do Apps Script. Detalhes e falhas: [PUBLICACAO-BACK.md](PUBLICACAO-BACK.md).

## Testes

- Rode a suíte inteira antes de cada push (`cd tests && node run.js --paralelo 4`). O CI roda no PR e na `main`.
- Mudou uma action: rode o teste da área. Serviço Google novo precisa existir no `fakegas.js`.
- Teste novo ou que mudou muito de tempo: atualize o `PESO` do `tests/run.js`. Detalhes: [tests/README.md](../tests/README.md).

## Documentação

- Funcionalidade nova ou mudada: atualize o arquivo da área ([índice](README.md)), nunca o `README.md` da raiz.
- Doc guarda regra, decisão, procedimento e onde fica no código. Não descreve tela (o código e os testes dizem).
- Decisão nova: uma linha em [decisoes/](decisoes/README.md).
- Limites de tamanho (`node tests/lib/contexto.js`; o teste `docs_tamanho_test` barra no CI): `docs/` inteira até 30 mil
  tokens, cada arquivo até 3 mil, AGENTS.md + CLAUDE.md até 1,5 mil, índice até 1 mil. Passou: divida ou corte.
