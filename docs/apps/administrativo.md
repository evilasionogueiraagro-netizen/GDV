# Portal do Administrativo

Lançamentos fora do campo (`web/administrativo/`); o painel só lê. Manual: `web/administrativo/manual.html` (não cita os outros módulos). Veja: [convênio](../modulos/convenio.md), [relatórios](../modulos/relatorios.md), [painel](painel.md).

## Regras
- Abas: Desembolso do convênio, Físico do convênio, Linhas dos relatórios, VIGIFITO, Diárias das escalas, Histórico.
- Lançamentos guardam quem e quando (`admId`); histórico em `AdmHistorico`. Excluir é lógico.
- Diária = valor ÷ valor unitário (editável); avisa memorando repetido, diária acima do previsto e data fora da vigência.
- Importações: mesma chave atualiza; linha que sumiu da planilha só sai se o gerente marcar; plantão repetido é recusado (salvo substituição).
- Login: matrícula e senha com a permissão `administracao` ([acessos](../modulos/acessos.md)); o token da sessão vai em `sessao`.
- LGPD: nome do servidor da diária só em `ConvFinanceiro.servidorNome` e no portal (painel: agregados).

## Código
- `web/administrativo/js/`: `adm.js`, `adm-convenio.js`, `adm-relatorios.js`, `adm-vigifito.js` (planilhas: `*-planilha.js`).
- `Code.gs`: `admDados` e as actions `adm*` de lançamento.
- Publicar: automático pelo merge na `main` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)). Abas novas nascem sozinhas.
