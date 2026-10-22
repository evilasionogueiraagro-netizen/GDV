# Publicação automática do back (Apps Script)

Quando os testes passam na `main`, o workflow [apps-script.yml](../.github/workflows/apps-script.yml) publica `apps-script/` com o [clasp](https://github.com/google/clasp) e cria versão nova na implantação atual. A URL `/exec` não muda.

## Como funciona
Testes passam na `main` → "Publicar Apps Script" não faz nada se o commit não é o último da `main` ou se o `GET /exec` já responde o `VERSAO_CODIGO`. Senão: `clasp push --force` (substitui os arquivos por `apps-script/`), `clasp redeploy` na implantação de `web/js/config.js` e confere o `GET /exec` (12 tentativas, de 10 s).

## Regras
- **Só publica se o `VERSAO_CODIGO` mudou.** Esqueceu? Mude-o num commit novo.
- O front vai no merge (`pages.yml`) e o back uns 10 min depois. Se o front depende de action ou coluna nova, ele aguenta o back antigo nesse intervalo, ou o back vai antes, em PR próprio.
- Não edite no editor do Apps Script (a próxima publicação sobrescreve). Publicar à mão: mude o `VERSAO_CODIGO` junto.
- Serviço novo do Google: a conta dona autoriza no editor (rode uma função, ex.: `onOpen`, e aceite); até lá, as chamadas com o serviço falham. Já deve estar combinado ([PORTABILIDADE.md](PORTABILIDADE.md)).

## Configurar (uma vez)
Precisa da conta dona (**adafegdv@gmail.com**) e do dono do repositório (só ele vê os segredos).

1. Ligue a "API do Google Apps Script" em <https://script.google.com/home/usersettings> (conta dona).
2. ID do script: planilha → **Extensões → Apps Script → Configurações do projeto → IDs → ID do script**.
3. Credencial, com Node 20+:
   ```sh
   npx --yes @google/clasp@3.4.1 -A ./clasprc-gdv.json login
   ```
   Entre como adafegdv@gmail.com. A página `localhost` "Logged in!" é normal. Confira (tem que dar `true`):
   ```sh
   jq -e '.tokens.default.refresh_token | length > 0' clasprc-gdv.json
   ```
   **Não commite** o arquivo: dá acesso aos scripts e ao Drive da conta.
4. Antes da primeira publicação, confira o remoto (o `push` apaga o que não está em `apps-script/`):
   ```sh
   mkdir /tmp/gdv-remoto && cd /tmp/gdv-remoto
   echo '{"scriptId":"<ID do script>"}' > .clasp.json
   npx --yes @google/clasp@3.4.1 -A <caminho>/clasprc-gdv.json pull
   ```
   Deve haver só `Code.gs` e `appsscript.json` (igual ao do repositório). Arquivo a mais (ex.: `Painel.html` antigo) será apagado: se ainda for usado, traga-o para `apps-script/` antes.
5. GitHub → **Settings → Secrets and variables → Actions**:
   - `CLASPRC_JSON`: o conteúdo inteiro do `clasprc-gdv.json`, copiado por comando (texto pela metade ou com sobra quebra o back): `xclip -sel clip < clasprc-gdv.json` (Linux) ou `pbcopy < clasprc-gdv.json` (macOS);
   - `APPS_SCRIPT_ID`: o ID do passo 2.
   Depois apague o `clasprc-gdv.json`. O segredo vale para workflows de qualquer branch (não de fork); para restringir à `main`, use um environment.
6. Teste: **Actions → Publicar Apps Script → Run workflow** (branch `main`). Com a versão já no ar, termina com "nada a publicar".

## Dia a dia
- **Voltar uma versão**: reverta o commit na `main` (o workflow publica o anterior). Na pressa: **Implantar → Gerenciar implantações → lápis → Versão**, escolha a anterior.
- **Projetos "SISTEMA GDV" em script.google.com**: o backup diário copia a planilha e o script ligado a ela (até 30 guardados). Só vale o da planilha de produção: pegue o ID em **Extensões → Apps Script** na planilha, não na lista.

## Quando o workflow falha
O passo que falhou diz a causa:
- **"Enviar o código"** com `Unexpected non-whitespace character after JSON` (ou `not valid JSON`): `CLASPRC_JSON` incompleto. Refaça os passos 3 e 5.
- **`invalid_grant`, `invalid_client` ou erro de autorização**: senha trocada ou acesso revogado. Refaça os passos 3 e 5.
- **"Nova versão na implantação atual"**: `APPS_SCRIPT_ID` é de outro projeto (ex.: cópia de backup). Pegue o ID pela planilha.
- Depois: **Run workflow** (passo 6), ou o próximo merge publica.
