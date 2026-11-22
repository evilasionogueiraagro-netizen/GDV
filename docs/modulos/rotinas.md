# Rotinas automáticas e arquivamento anual

Gatilhos de tempo do Apps Script (12 h, backup, relatório, arquivamento). Veja também: [acessos](acessos.md).

## Regras
- Ativar (dono da planilha): menu e-GDV → Ativar rotinas automáticas. Desativar apaga os gatilhos e o encerramento do painel.
- Planilha antiga: cole o `Code.gs`, rode Ativar de novo e publique nova versão.
- Turno aberto há mais de 12 h (horário de Manaus) é encerrado a cada 30 min (`encerradoPor` = 'Automático (12 h)').
- Fim: horário do celular, se houver; senão o último registro do turno (veículo, sinal ou início), nunca depois de início + 12 h. Não reabre.
- O painel também roda esse encerramento dentro de `painelDados`, no máximo 1 vez a cada 10 min (funciona sem os gatilhos).
- Backup (~03h): cópia em `GDV - Backups`, uma por dia; ficam as 30 mais recentes (as antigas vão para a lixeira do Drive, 30 dias). Restaurar: copie as abas de volta ou aponte `SHEET_ID` para a cópia.
- Relatório mensal (dia 1, ~07h): e-mail do mês anterior, sem CPF/CNPJ. Destinatários em `RELATORIO_EMAILS` (vírgula); sem ela, vai ao dono. Cota gratuita: 100 destinatários/dia.
- Arquivamento anual (~04h): a principal guarda o ano atual e o anterior; o resto vai para `e-GDV – Arquivo AAAA` (em `GDV - Arquivo anual`): `Veiculos` (com o turno), `Turnos` e `Andamento` finalizados, `Consultas`. Turno aberto nunca sai.
- Arquivar: backup antes; lotes de 5.000 linhas (copia, confere, apaga); repetir não duplica (`id`); acima de 4 min, retoma depois.
- Fica na principal: `TFs`, `Levantamentos`, `Colheitas`, `Numeracao`, `Pessoas`, `Placas`, `Propriedades`, `Fiscais`, `Permissoes`, `Barreiras`, `Arquivos`, `Aparelhos`.

## Medição de desempenho (aba `Desempenho`, `desempenho.gs`)
- Cada chamada ao `doPost` mede tempo total, espera e uso do lock (`lockMedido_`) e leituras de aba (`lerTudo_`, `lerLeitura_`).
- Amostras no cache; a cada 150 ou 15 min, uma linha por hora (Manaus) e action: média, p50, p90, máximo, erros. Simultâneas podem se perder.
- Desligar sem publicar: propriedade `DESEMPENHO_DESLIGADO` = 1.

## Dados
- Propriedades: `ROTINAS_DESATIVADAS`, `RELATORIO_EMAILS`, `ULTIMO_BACKUP` e `_ERRO`, `ARQUIVO_ANUAL_AAAA`, `ULTIMO_ARQUIVAMENTO` e `_ERRO`.

## Código
- `Code.gs`: `ativarRotinasAutomaticas_`, `encerrarTurnosAutomatico`, `backupDiario`, `relatorioMensal`, `arquivarAnosAntigos_`.
