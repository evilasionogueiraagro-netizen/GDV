# Publicação automática do Apps Script

O workflow [`.github/workflows/apps-script.yml`](../.github/workflows/apps-script.yml) publica o back sozinho: quando os
testes passam na `main`, ele envia `apps-script/` para o projeto do Apps Script com o
[clasp](https://github.com/google/clasp) (ferramenta oficial do Google) e cria uma nova versão **na implantação atual**.
A URL `/exec` não muda.

## Como funciona

1. Merge na `main` → roda o workflow "Testes automáticos".
2. Testes passaram → roda "Publicar Apps Script":
   - se o commit testado não é mais o último da `main`, não faz nada (a execução do commit mais novo publica);
   - lê o `VERSAO_CODIGO` do `Code.gs` e a URL `/exec` de `web/js/config.js` (o ID da implantação está na URL);
   - se a versão no ar (`GET /exec`) já é a do repositório, não faz nada. **Só publica quando o `VERSAO_CODIGO` muda**;
   - `clasp push --force`: substitui todos os arquivos do projeto pelos de `apps-script/` (`Code.gs` e `appsscript.json`);
   - `clasp redeploy <implantação>`: cria uma versão nova e aponta a implantação atual para ela;
   - confere se o `GET /exec` passou a responder a versão nova; se não, o workflow falha.

O front continua indo pelo `pages.yml`, logo no merge. O back entra uns 10 minutos depois (o tempo dos testes). Mudança em
que o front depende de action ou coluna nova: o front precisa aguentar esses minutos com o back antigo, ou faça primeiro um
PR só com o back.

## Configurar (uma vez)

Precisa da conta dona do script (**adafegdv@gmail.com**) e do dono do repositório no GitHub (só ele vê os segredos).

1. **Ativar a API do Apps Script** na conta dona: entrar em <https://script.google.com/home/usersettings> logado como
   adafegdv@gmail.com e ligar "API do Google Apps Script".
2. **ID do script**: na planilha, **Extensões → Apps Script → Configurações do projeto (engrenagem) → IDs → ID do script**.
3. **Credencial do clasp**, num computador com Node 20+:
   ```sh
   npx --yes @google/clasp@3.4.1 -A ./clasprc-gdv.json login
   ```
   O navegador abre: entre como **adafegdv@gmail.com** e aceite. O arquivo `clasprc-gdv.json` é a credencial.
   **Não commite esse arquivo**: com ele dá para mexer nos scripts e em arquivos do Drive da conta.
4. **Conferir o projeto antes da primeira publicação** (o `push` apaga do projeto o que não estiver em `apps-script/`):
   ```sh
   mkdir /tmp/gdv-remoto && cd /tmp/gdv-remoto
   echo '{"scriptId":"<ID do script>"}' > .clasp.json
   npx --yes @google/clasp@3.4.1 -A <caminho>/clasprc-gdv.json pull
   ```
   Compare com o repositório: deve haver só `Code.gs` e `appsscript.json`, e o `appsscript.json` deve ser igual ao do
   repositório. Arquivo a mais (ex.: o `Painel.html` antigo) será apagado na primeira publicação; se ele ainda for usado,
   traga-o para `apps-script/` antes.
   O navegador termina numa página `localhost` com "Logged in! You may close this page.": é isso mesmo, a credencial não
   aparece na tela, fica no arquivo. Para conferir (tem que responder `true`):
   ```sh
   jq -e '.tokens.default.refresh_token | length > 0' clasprc-gdv.json
   ```
5. **No GitHub**: **Settings → Secrets and variables → Actions → New repository secret** (ou o lápis, se já existe), duas vezes:
   - `CLASPRC_JSON`: o conteúdo inteiro do `clasprc-gdv.json`. Não selecione o texto à mão no terminal (é fácil pegar pela
     metade ou com texto a mais): copie o arquivo para a área de transferência com `xclip -sel clip < clasprc-gdv.json`
     (Linux) ou `pbcopy < clasprc-gdv.json` (macOS) e cole com Ctrl+V;
   - `APPS_SCRIPT_ID`: o ID do script do passo 2.

   Depois apague o `clasprc-gdv.json` do computador. Segredo do repositório fica disponível para os workflows de qualquer
   branch do repositório (não de forks): só quem tem acesso de escrita ao repositório consegue usá-lo. Se o dono quiser
   restringir à `main`, pode mover os dois segredos para um ambiente (Settings → Environments) liberado só para a `main` e
   acrescentar `environment: <nome>` no job do workflow.
6. **Testar**: **Actions → Publicar Apps Script → Run workflow** (branch `main`). Com a versão do repositório já no ar, ele
   termina com "nada a publicar"; isso já confere a leitura da versão. A publicação de verdade acontece no próximo merge
   que mudar o `VERSAO_CODIGO`.

## No dia a dia

- **Não edite o código no editor do Apps Script**: a próxima publicação sobrescreve. O repositório é a fonte.
- **Esqueceu de mudar o `VERSAO_CODIGO`?** Nada é publicado. Mude a versão num commit novo.
- **Serviço novo do Google** (escopo novo de autorização): o workflow publica, mas o Google exige que a conta dona
  autorize. Abra o editor do Apps Script com adafegdv@gmail.com, rode qualquer função (ex.: `onOpen`) e aceite. Até lá,
  as chamadas que usam o serviço novo falham. Pela regra de [PORTABILIDADE.md](PORTABILIDADE.md), serviço novo do Google
  já é exceção e combinado antes.
- **Voltar uma versão**: reverta o commit na `main`; o `VERSAO_CODIGO` antigo é diferente do que está no ar, então o
  workflow publica o código anterior. Na pressa: **Implantar → Gerenciar implantações → lápis → Versão** e escolha a
  anterior (o próximo merge com versão nova publica de novo).
- **Vários projetos "SISTEMA GDV" em script.google.com**: o backup diário copia a planilha inteira, e o Google copia junto o
  script ligado a ela (um por dia, até os 30 backups guardados). Só o da planilha de produção vale: para achar o ID, abra
  a planilha → **Extensões → Apps Script**, nunca pela lista.
- **Publicar à mão** continua possível, como antes (colar o `Code.gs` → Nova versão). Mude o `VERSAO_CODIGO` do
  repositório junto, senão o próximo merge publica o que estiver no repositório.

## Quando o workflow falha

O passo que falhou diz a causa:

- **"Enviar o código" com `Unexpected non-whitespace character after JSON at position N`** (ou `... is not valid JSON`): o
  segredo `CLASPRC_JSON` não é um JSON inteiro (colado pela metade ou com texto a mais). Refaça os passos 3 e 5. Foi o que
  deixou o back parado em `2026-10-16f` de 16 a 20/10/2026 enquanto o front seguia publicando.
- **`invalid_grant`, `invalid_client` ou erro de autorização**: senha da conta trocada ou acesso revogado. Refaça os passos 3
  e 5.
- **"Nova versão na implantação atual" falhou**: o `APPS_SCRIPT_ID` não é o do projeto que tem a implantação da URL `/exec`
  (ex.: ID de uma cópia de backup). Pegue o ID pela planilha, como no item acima.

Depois de corrigir: **Actions → Publicar Apps Script → Run workflow** (branch `main`), ou o próximo merge na `main` publica
sozinho (o workflow compara a versão do repositório com a do ar, não com a do merge anterior).
