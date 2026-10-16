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
5. **No GitHub** (dono do repositório): **Settings → Environments → New environment** com o nome `apps-script`.
   - Em **Deployment branches and tags**, escolha **Selected branches and tags** e adicione `main`. Assim os segredos só
     ficam disponíveis para a `main`, nunca para uma branch qualquer.
   - Em **Environment secrets**, crie:
     - `CLASPRC_JSON`: o conteúdo inteiro do `clasprc-gdv.json`;
     - `APPS_SCRIPT_ID`: o ID do script do passo 2.
   - Depois apague o `clasprc-gdv.json` do computador.
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
- **Workflow falhou na credencial** (senha da conta trocada, acesso revogado): refaça o passo 3 e atualize o segredo
  `CLASPRC_JSON`.
- **Publicar à mão** continua possível, como antes (colar o `Code.gs` → Nova versão). Mude o `VERSAO_CODIGO` do
  repositório junto, senão o próximo merge publica o que estiver no repositório.
