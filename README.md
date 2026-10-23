# e-GDV – Controle de Veículos (Barreiras Fitossanitárias)

App para registrar os veículos abordados em barreiras **fixas ou móveis**, por turno, e gerar o
**Termo de Fiscalização** e a **Ficha de Campo** (modelos HTML de `web/documentos/`).

Sistema da ADAF (defesa agropecuária do Amazonas), da Gerência de Defesa Vegetal (GDV), para as barreiras fitossanitárias e a
vigilância de campo. São três apps e um dashboard público, todos publicados a partir da pasta `web/`.

## Os apps

**App de campo (fiscais nas barreiras).** PWA instalado no celular do fiscal, que funciona sem internet. O fiscal abre o
turno, registra os veículos abordados, lavra o TF de Barreira, faz os levantamentos e termos do PCE e imprime os documentos;
tudo fica no aparelho e sobe para a planilha quando há conexão. Endereço: https://evilasionogueiraagro-netizen.github.io/GDV/
(manual: [docs/apps/campo.md](docs/apps/campo.md)).

**Painel do gestor (gerência).** App separado, só para administrador: indicadores, mapa do Amazonas, barreiras ao vivo e
alertas, TF, PCE, convênios, relatórios, acessos dos servidores e o Modo TV da sala de situação. Endereço:
https://evilasionogueiraagro-netizen.github.io/GDV/painel/ (manual: [docs/apps/painel.md](docs/apps/painel.md)).

**Portal do Administrativo.** Para o Administrativo da GDV lançar o que não vem do campo (desembolso e físico do convênio,
linhas manuais dos relatórios e do VIGIFITO), com o registro de quem lançou e quando. Endereço:
https://evilasionogueiraagro-netizen.github.io/GDV/administrativo/ (manual: [docs/apps/administrativo.md](docs/apps/administrativo.md)).

**Dashboard público.** Página sem login, ligada pelo gerente, com mapa e números só de contagens e somas, sem nenhum dado
pessoal. Endereço: https://evilasionogueiraagro-netizen.github.io/GDV/dashboard/ (manual: [docs/apps/dashboard.md](docs/apps/dashboard.md)).

**Página inicial (atalhos para tudo):** https://evilasionogueiraagro-netizen.github.io/GDV/inicio/ leva ao painel, ao app de campo,
ao Portal do Administrativo e ao dashboard público, cada um com uma linha de como entrar. Não usa login nem chama a API
(`web/inicio/index.html`). A raiz `/GDV/` continua sendo o app de campo, que já está instalado nos celulares.

A página pública `verificar.html` confere a autenticidade de um TF pelo QR code impresso ([docs/modulos/tf.md](docs/modulos/tf.md)).

## Arquitetura

- Front estático em `web/` (HTML/JS/CSS puro, sem build), publicado no GitHub Pages a cada merge na `main`.
- App de campo offline primeiro: banco local no IndexedDB e service worker (`web/sw.js`) com envio em segundo plano.
- Back: Web App do Apps Script (`apps-script/Code.gs`), um endpoint `doPost` que despacha por `action` ([docs/API.md](docs/API.md)).
- Banco: planilha Google, uma aba por tabela; fotos, PDFs e backups no Drive da conta dona do script.
- O back é publicado pelo workflow com clasp ([docs/PUBLICACAO-BACK.md](docs/PUBLICACAO-BACK.md)).

## Documentação

- [docs/README.md](docs/README.md): índice por área (o que ler para cada assunto), estrutura das pastas e testes.
- [AGENTS.md](AGENTS.md): regras do projeto para agentes e devs (colunas, versão do back, LGPD, publicação).
