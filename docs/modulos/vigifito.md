# VIGIFITO (relatório por posto)

Indicadores VIGIFITO por posto (BVA fixas e volantes): totais por município, fixas, volantes e geral. Veja também: [relatórios](relatorios.md).

## Regras
- 24 indicadores (28 linhas) em `web/documentos/indicadores.js`: e-GDV (turnos e TFs de barreira não cancelados); só capacitação e madeira (m³) são lançadas.
- Educação sanitária = pessoas a bordo dos veículos (uma medida por pessoa).
- Carga em trânsito: TF com UF de destino ≠ AM. Internalização: destino AM vindo de outra UF ou do exterior. Veículo com TF ligado conta só pelo TF.
- UF do TF: `ufOrigem`/`ufDestino`, senão texto ou veículo; `UF_LOCAL` (padrão AM). Unidades sem conversão (caixas, sacos) à parte; t = kg ÷ 1.000.
- Substituição: lançado que troca o e-GDV do posto e mês (justificativa); relatório marca ‡.
- Colunas antigas de `Veiculos` não contam desde 2026-10-19e.
- Turno fixo → posto do local; volante → posto volante do município; sem posto: "OUTRAS BVA FIXAS / AÇÕES VOLANTES (não mapeadas)".
- Postos: os 11 da planilha de controle + `manaus-ceasa` (BVA - CEASA). Lista salva antes dele ganha o posto ao ler (a CEASA sai de outro posto onde estivesse), até ser salva de novo (`ceasa: 1`).
- Quadros (tela, Word, PDF, Excel): o rótulo do indicador com linha em t ocupa as duas linhas, como na planilha.
- Período de 10 dias: âncora 05/01/2025, ciclo 9; conta pela data de início do turno.
- Avisos: turnos sem posto, t/m³ fora do padrão, substituições. Negativos e decimais são recusados.

## Importação do relatório de plantão
Portal → VIGIFITO → Importar relatório de plantão (.xls/.xlsx).
1. Prévia: posto (BVA do cabeçalho), troca às 07:00 (carga antes = dia anterior), UF de origem padrão, fiscal.
2. Gravação: um turno por dia (07:00 às 06:59, encerrado; dia todo zerado não vira turno); um veículo por carga; carga sem liberação nem apreensão = liberação.
3. Só carga com nº do TF conta como TF, medida, liberação/apreensão e exame. Sem nº do TF: fora dos números.
- TFs do papel não entram na aba `TFs`. Reimportar pergunta; "Substituir" marca os antigos `excluido = 1`.

## Dados
- `VigConfig`: postos, âncora, ciclo (semente `vigSemente_`).
- `VigLancamentos`: uma linha por período|posto|indicador; `substitui`, `justificativa`, `origem`.
- `Turnos`/`Veiculos`: coluna `importacao` (`pl|posto|1º dia`).

## Código
- `web/documentos/vigifito-docs.js` (cálculo, Word, PDF, .xlsx); `web/administrativo/js/{adm-vigifito,plantao-planilha}.js`.
- `Code.gs`: `motorBarreira_`, `vigApurar_`, `painelVigDados`, `admVigLancar`, `admVigImportar`.

## LGPD
- Nomes e placas do plantão ficam só na planilha e na prévia.
