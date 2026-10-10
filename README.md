# GDV – Controle de Veículos (Barreiras Fitossanitárias)

App para registrar os veículos abordados em barreiras **fixas ou móveis**, por turno, e gerar o
**Termo de Fiscalização** e a **Ficha de Campo** (modelos HTML de `web/documentos/`).

## Como funciona

```
 Celular do fiscal (PWA, funciona SEM internet)          Google
 ┌─────────────────────────────────────────┐   quando há    ┌──────────────────────┐
 │ web/  → banco local (IndexedDB)          │   internet     │ apps-script/Code.gs  │
 │        registra, lista, resumo, PDFs     │ ─────────────► │ grava na planilha    │
 │        histórico e dashboard             │ ◄───────────── │ (Turnos / Veiculos)  │
 └─────────────────────────────────────────┘   sincroniza   └──────────────────────┘
```

- **Offline primeiro:** tudo é salvo no aparelho. Ao voltar a conexão (ou a cada 60 s online) o app envia o que está pendente e baixa o que mudou. O selo no topo mostra 🟢 Online / 🔴 Offline e quantos registros aguardam envio.
- **Um fiscal por turno** lança os dados; vários aparelhos/barreiras podem usar a mesma planilha (cada registro tem ID único; em conflito vale a edição mais recente).
- **Horários do turno:** o início é o instante em que o fiscal toca em *Iniciar turno* e o fim, o instante de *Encerrar turno* (relógio do aparelho; mantenha data/hora automáticas). Ambos vão para o Termo. A letra do TF e o quadradinho da Ficha são deduzidos do início: 04:00–11:59 = A, demais = B. O Termo é liberado após encerrar. O encerramento é definitivo (não há como reabrir o turno).
- **Coordenadas:** ao iniciar e ao encerrar o turno o app grava latitude, longitude e precisão (m) do GPS do aparelho (funciona sem internet; o navegador pede permissão de localização na primeira vez). Se o GPS falhar ou for negado, o turno segue normalmente, sem coordenadas. No Termo, o campo *Coordenadas Geográficas* recebe a coordenada **final** (encerramento; se ela faltar, a do início). Aparecem nas telas (com link para o mapa) e na planilha (`Turnos`).
- **Excluir** apenas marca como excluído (some das telas e relatórios, permanece na planilha para auditoria).
- **Histórico/Dashboard** funcionam offline, a partir dos dados já sincronizados no aparelho. O botão **Limpar histórico deste aparelho** remove do celular os turnos já encerrados (não apaga a planilha, não afeta o turno em andamento e só funciona se tudo já tiver sido enviado).
- **Sincronização automática:** a cada minuto, ao voltar a internet, ao reabrir o app e após cada registro. Tocar no selo do topo força na hora. A tela *Status* só mostra o estado; não há campos de URL/chave.
- **Fiscais:** dois campos de nome completo (nome e sobrenome); pelo menos um é obrigatório. No Termo e na Ficha aparecem como “Nome 1 e Nome 2”.
- A quantidade de **pessoas** é uma estimativa por tipo de veículo (padrões em `web/js/config.js`), editável em cada registro.

## Publicação (uma vez)

### 1. Banco de dados e API (Google)
1. Crie uma planilha no Google Sheets (ex.: “GDV – Banco de dados”).
2. **Extensões → Apps Script**. Cole `apps-script/Code.gs`; em *Configurações do projeto* ative “Mostrar arquivo de manifesto” e cole `apps-script/appsscript.json`.
3. **Configurações do projeto → Propriedades do script → Adicionar**: `ACCESS_KEY` = uma senha longa (será usada só para gerar o link de ativação).
4. **Implantar → Nova implantação → App da Web**: executar como *Eu*, acesso *Qualquer pessoa*. Copie a URL que termina em `/exec`.
   > O acesso é “qualquer pessoa” para o app funcionar sem login Google no campo; a proteção é a `ACCESS_KEY`. Ao alterar o `Code.gs` (ex.: nova versão do projeto), cole o código novo e faça uma nova implantação (as colunas novas são acrescentadas sozinhas na planilha existente) (Gerenciar implantações → editar → nova versão).

### 2. O app (GitHub Pages)
1. No GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Faça merge na `main`; o workflow `.github/workflows/pages.yml` publica a pasta `web/`.
3. **Ativar os aparelhos sem digitar nada:** abra `…/ativar.html` do app, informe a URL `/exec` e a chave e clique em *Gerar link*. Envie o link (ex.: WhatsApp) a cada fiscal; ao abri-lo e confirmar, o aparelho fica ativado e o código sai da barra de endereço. Depois use *Adicionar à tela inicial* para instalar e abra uma vez com internet para o app ser guardado no aparelho.
   > Alternativa (não recomendada): preencher `CONFIG.sync` em `web/js/config.js` deixa todos os aparelhos já ativados, mas a chave fica **pública** (o site e o repositório são públicos): qualquer pessoa poderia ler e gravar na planilha.

Para testar localmente: `cd web && python3 -m http.server 8080`.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `web/` | App (HTML/JS/CSS puro, sem build). `js/config.js` guarda unidade, tipos de veículo, turnos e pessoas estimadas |
| `web/documentos/` | Modelos HTML do Termo e da Ficha (impressos via “Salvar como PDF”) |
| `apps-script/` | API de sincronização que grava na planilha |

## Limites conhecidos
- A **Ficha de Campo** tem 50 linhas; acima disso o app avisa e os excedentes ficam fora da ficha (o Termo conta todos).
- Em caso de relógios de aparelho muito errados, a regra “edição mais recente vence” pode escolher a edição errada; mantenha data/hora automáticas ativadas.
- Ao alterar arquivos de `web/`, aumente `VERSAO` em `web/sw.js` para os aparelhos receberem a atualização.
