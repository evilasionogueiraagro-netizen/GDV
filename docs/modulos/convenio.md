# Convênio MAPA/ADAF

Aba **Convênios** do painel (só admin): metas, financeiro e relatório do Convênio SUASA nº 991272/2025. Veja também: [relatórios](relatorios.md).

## Regras
- Vigência 01/12/2025–01/04/2027; execução desde 01/03/2026; global R$ 2.268.042,00.
- Acumulado: início da execução ao fim do mês de referência. Esperado: linear, da execução ao fim da vigência; ≥ 5 p.p. acima = adiantada, > 5 p.p. abaixo = atrasada. Alerta: > 15 p.p. abaixo; mês sem registro em etapa automática.
- Manuais: 1.1 (10 bens; adquirido/entregue = valor de aquisição → 44.90.52); 1.3 (24 armadilhas/município; monilíase em 5); 1.5 (72); 1.14 (6). Ajuste +/− justificado = manual.
- Automáticas: 1.4 (52 municípios com praga/TF de monilíase); 1.9 (24; Tabatinga); 1.10 (18.000 veículos das BVAs de `CONFIG.bvas`, mesma BVA = 1 vez; 1.800 diárias só no financeiro).
- Físico = acumulado ÷ meta (máx. 100%); financeiro = executado ÷ previsto; diferença > +10 p.p. "financeiro à frente", < −10 "físico à frente"; alerta > 20 p.p.
- Projeção: ritmo = média dos 3 últimos meses; acaba = mês + ⌈saldo ÷ ritmo⌉; alerta se passa da vigência.
- Relatório: textos do último salvo; Parcial nº automático; Word = PDF.

## Importação da planilha
Portal → Desembolso: `MOVIMENTAÇÃO CONVÊNIO VEGETAL - 2026.xlsx`; prévia; gravação (`admConvFinImportar`, máx. 500).
- Abas `SUBETAPA x.y.z` (`CONSOLIDADA` ignorada, `SOMA` só confere); valor > 0.
- Sem data nem memo: total da aba (soma das demais; descartado) ou "lançamento sem data".
- Memo repetido: fora por padrão; fora da vigência/plano: bloqueada.
- Diárias (33.90.14/.36) = valor ÷ unitário (NM 120/210, NS 132/252; estado/fora); meia 0,5.
- Prévia por subetapa: novos, iguais e alterados, com avisos. Data antes do início da execução = aviso (importa e conta no primeiro mês).
- Chave `imp|convênio|item|memo`: igual = nada; mudou = atualiza; sumiu da planilha = só sai (exclusão lógica) se o gerente marcar na prévia.

## Dados
- `Convenios` (config JSON; sem linha: `convSemente_`); `ConvLancamentos` (portal); `ConvFinanceiro` (`chave`, `origem`, `arquivo`, `importadoEm`); `ConvRelatorios`.

## Código
- `web/painel/js/{painel-convenios,docx,conv-planilha}.js`; `web/documentos/{conv-docs.js,conv-relatorio.html}`.
- `Code.gs`: `painelConvenios`, `painelConvApuracao`, `admConvFinImportar`.

## LGPD
- Só contagens; NOME nunca lido; servidor recusa CPF.
