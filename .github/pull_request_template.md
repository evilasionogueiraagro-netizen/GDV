<!-- Título do PR: "<Área>: <o que muda>" (ver docs/FLUXO-GIT.md). Apague os comentários que não servirem. -->

## O que muda

<!-- Para quem usa: fiscal, administrativo, gerência. Em linguagem de usuário, não de código. -->

## Por quê / quem pediu

<!-- Motivo e quem pediu, pelo setor ou cargo (ex.: gerência da GDV). Sem nome nem outro dado pessoal real. -->

## Áreas

- [ ] App de campo
- [ ] Painel
- [ ] Portal do Administrativo
- [ ] Dashboard
- [ ] Servidor (`Code.gs`)
- [ ] Testes / CI
- [ ] Docs

## Servidor

<!-- Só se mexeu no Code.gs; senão, escreva "não mexe". -->

- `VERSAO_CODIGO` novo (maior que o da `main`):
- Coluna nova em `TABELAS`? não / sim: qual. Coluna nova só no **fim** do array; nunca renomear, reordenar ou remover.
- Serviço novo do Google? não / sim: qual e com quem foi combinado (precisa existir também no `tests/fakegas.js`).

## Como testei

- Testes rodados: <!-- ex.: node run.js pce_server_test pce_e2e -->
- Tela conferida: <!-- ex.: app no celular, Painel → Convênios -->

## Checklist

- [ ] `main` trazida para a branch (`git merge origin/main`)
- [ ] Nenhum dado pessoal real (nome, CPF, placa, coordenada, trecho de planilha ou relatório)
- [ ] Docs atualizadas, se a mudança pede (README.md, docs/API.md, AGENTS.md)
