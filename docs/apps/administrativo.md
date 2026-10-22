# Portal do Administrativo

Lançamentos fora do campo (`web/administrativo/`); o painel só lê. Veja: [convênio](../modulos/convenio.md), [relatórios](../modulos/relatorios.md), [painel](painel.md).

## Regras
- Abas: Desembolso do convênio, Físico do convênio, Linhas dos relatórios, VIGIFITO, Histórico.
- Lançamentos guardam quem e quando (`admId`); histórico em `AdmHistorico`. Excluir é lógico.
- Diária = valor ÷ valor unitário (editável); avisa memorando repetido, diária acima do previsto e data fora da vigência.
- Importações: mesma chave atualiza; linha que sumiu da planilha só sai se o gerente marcar; plantão repetido é recusado (salvo substituição).
- Login: Google (`admLogin`) ou código de 6 dígitos do painel (`admCodigo`), permanente; 10 recusas bloqueiam 15 min.
- Sessão: 30 dias sem uso; só o SHA-256 fica em `AdmSessoes`. `admSair` revoga. Não vale no painel nem no app.
- Liberados (painel → Servidores): máximo 10 ativos (`ADM_MAX`). Remover só revogado: `oculto = 1`, nada apagado.
- LGPD: nome do servidor da diária só em `ConvFinanceiro.servidorNome` e no portal (painel: agregados). E-mails só na aba `Administrativo`.

## Código
- `web/administrativo/js/`: `adm.js`, `adm-convenio.js`, `adm-relatorios.js`, `adm-vigifito.js` (planilhas: `*-planilha.js`).
- `Code.gs`: `admLogin`, `admCodigo`, `admDados`; painel: `painelAdmLista`, `painelAdmSalvar`.
- Publicar: automático pelo merge na `main` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)). Abas novas nascem sozinhas.

## Login Google (uma vez; sai com o [acesso novo](../decisoes/acesso.md))
1. Google Cloud: consentimento "Externo", sem escopos; e-mails em usuários de teste.
2. ID do cliente OAuth (aplicativo da Web), origem `https://evilasionogueiraagro-netizen.github.io`.
3. Cole o ID em `CONFIG.adm.googleClientId` (`web/js/config.js`) e em `GOOGLE_CLIENT_ID`.
4. Autorize `UrlFetchApp` (rodar uma função no editor).
