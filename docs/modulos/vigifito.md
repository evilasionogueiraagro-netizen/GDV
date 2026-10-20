# VIGIFITO (relatório por posto)

Os indicadores VIGIFITO por posto: fonte de cada um, origem/destino, substituições, postos, período de 10 dias, saídas, avisos
e actions. Veja também: [relatórios](relatorios.md), [TF](tf.md), [Portal do Administrativo](../apps/administrativo.md).

Os **24 indicadores** da planilha de controle VIGIFITO (28 linhas, contando as de t), com as mesmas unidades e definições, **por posto** (BVA fixas e volantes), com **totais por município**, **total das fixas**, **total das volantes** e **total geral**:

O sistema **calcula** os indicadores a partir do banco alimentado pelo app das barreiras (turnos, veículos — pessoas a bordo e UF opcional — e **TFs de barreira**); o Administrativo lança só o que não tem como vir do campo.

| Indicador | Unid. | Fonte |
|---|---|---|
| Veículos parados pela fiscalização | nº | e-GDV: veículos (não excluídos) dos turnos do posto |
| Exame e análise de documento de sanidade e fiscal | nº | e-GDV: **TFs** com documento preenchido (NF, PTV, GTA, SIF, SIE, SIM, lacre, outros) |
| Fiscalização de partidas | nº | e-GDV: **TFs** de barreira (não cancelados) — cada TF é uma partida fiscalizada |
| Inspeção fitossanitária | nº | e-GDV: **TFs** com *Inspeção* marcada (a mesma do 16.1) |
| Cargas em trânsito para outros estados | nº | e-GDV: **TFs com UF de destino ≠ AM** + veículos **sem TF ligado** com UF de destino ≠ AM |
| Internalização de partidas | nº e t | e-GDV: **TFs de outra UF (ou do exterior) com destino ao AM** + veículos **sem TF ligado** com essas UFs; t = produtos dos TFs em kg (÷ 1.000) ou t (veículo sem TF não tem t) |
| Termo de colheita de amostra / Envio de amostra para Unidade Central ou Laboratório | nº | e-GDV: TFs com coleta / amostras desses TFs |
| Medida de Educação Sanitária | nº | e-GDV: **pessoas a bordo** dos veículos registrados (uma medida por pessoa) |
| Medida Fitossanitária | nº | e-GDV: **TFs** de barreira (não cancelados) |
| Abordagem itinerante (volante) | nº | e-GDV: turnos volantes do posto |
| Capacitação técnica | nº | **lançado** (portal) |
| Exportação de vegetais para outros Estados | t | e-GDV: produtos dos TFs com destino a outra UF (kg ÷ 1.000 ou t) |
| Exportação de madeira para outros Estados | m3 | **lançado** (portal) |
| Importação de vegetais de outros Estados | t | e-GDV: produtos dos TFs de outra UF (ou do exterior) com destino ao AM |
| Termo de fiscalização – resultou em: 16.1 Inspeção, 16.2 Advertência, 16.3 Rechaço, 16.4 Fiel depositário, 16.5 Liberação (nº e t), 16.6 Infração, 16.7 Apreensão (nº e t) | nº / t | e-GDV: TFs não cancelados; toneladas = produtos dos TFs em kg (÷ 1.000) ou t, outras unidades (caixas, sacos…) listadas à parte, **sem conversão** |
| Auto de destruição | nº e t | e-GDV: TFs de apreensão (no e-GDV o procedimento é "apreensão p/ destruição") |

- **Origem/destino e dedupe:** UF do TF = colunas `ufOrigem`/`ufDestino`; TF antigo = sigla no fim do texto de origem/destino; senão a do veículo ligado. Destino AM vindo de outra UF (ou do exterior) = internalização (`internN`, `internT`, `importT`); destino em outra UF = carga em trânsito (`cargasEstados`, `exportT`); unidades sem conversão desses TFs (caixas, sacos…) vão à parte ("Cargas interestaduais (TF)"). O veículo com TF ligado (`TFs.veiculoId`, TF não cancelado) conta só pelo TF — nunca duas vezes. A UF do estado é a propriedade `UF_LOCAL` (padrão `AM`). Na lista do turno e no painel (Barreiras → Veículos registrados) aparece "origem → destino" (e a carga dos registros antigos).
- **Registros antigos do veículo:** as colunas `semEducacao`, `medidaFito`, `carga`, `produtos`, `partida`, `inspecaoFito` e `docConferido` da aba `Veiculos` ficam como histórico (não são removidas nem zeradas), mas **não entram mais no cálculo** desde a versão 2026-10-19e: um mês já apurado com elas pode mudar de número ao ser gerado de novo.
- **Toda linha do e-GDV aceita, como contingência, um valor lançado que a SUBSTITUI** naquele posto e mês (meses anteriores ao e-GDV ou correção), com justificativa obrigatória; o relatório marca a origem: sem marca = e-GDV, † = lançado, ‡ = substituído (e lista as substituições com a justificativa).
- **Postos do VIGIFITO** (configuração própria, editável no painel → Relatórios → VIGIFITO → **Postos do VIGIFITO**; aba `VigConfig`): semente com os 11 postos da planilha 2025 (PRESIDENTE FIGUEIREDO - BVA JUNDIÁ, PRESIDENTE FIGUEIREDO - VOLANTE, MANAUS - BVA AEROPORTO, MANAUS - VOLANTE, PARINTINS - BVA PORTO, PARINTINS - BVA VOLANTE, HUMAITÁ - BVA FIXA, IRANDUBA - BVA VOLANTE, GUAJARÁ - BVA VOLANTE, TABATINGA - BVA VOLANTE (PORTO), BENJAMIN CONSTANT - BVA VOLANTE (PORTO)). Cada posto tem tipo (fixa/volante), município e, nas fixas, os nomes de BVA do e-GDV (local do turno, ex.: `BVA - JUNDIÁ`). Turno de BVA fixa entra no posto que tem o local do turno; turno volante, no posto volante do município do turno (unidade ou nome do município no local). Turno sem posto entra em **"OUTRAS BVA FIXAS / AÇÕES VOLANTES (não mapeadas)"** (nos totais) com aviso — ex.: a BVA - CEASA, que não está na planilha. As BVAs/portos novos não foram cadastrados em `CONFIG.bvas` (a confirmar com o gestor).
- **Período de 10 dias (escala):** data-âncora configurável (padrão **05/01/2025**) e ciclo de **9 dias**; os períodos são "05/01 A 14/01/2025", "14/01 A 23/01/2025"… — o dia da troca aparece nos dois rótulos, mas **cada registro conta uma vez, pela data de início do turno**: o turno que começa no dia da troca pertence ao período que começa nesse dia. O último período do ano vai até janeiro do ano seguinte (pertence ao ano em que começa).
- **Saídas:** Word e PDF (cabeçalho com o brasão, rodapé com os logos; mensal/período/semestral = quadro indicadores × postos com os totais; anual = quadros mensais do total, das fixas e das volantes, quadro por posto do ano, quadro mês a mês de cada posto e os períodos de 10 dias das BVAs fixas) e **Excel .xlsx** como exportação dos dados (SheetJS; anual: abas VIGIFITO — postos × J…D, 1º/2º semestre e total, e o bloco por município —, uma aba de períodos por BVA fixa como "JUNDIÁ", "1 semestre", "2 semestre", "Anual" e "ANUAL-MES").
- **Avisos** antes de gerar: turnos sem posto, valor fora do padrão (t/m³ mais de 3× a média do posto nos outros meses — ex.: kg lançado como t), unidades sem conversão, substituições e linhas manuais sem lançamento. Negativos e decimais em contagem não entram (o servidor recusa).
- **Servidor:** `painelVigDados {key, ano}` / `admVigDados {sessao, ano}` → `{cfg, indicadores, lancamentos, apuracao: {postos, porMes, porPeriodo, naoMapeados}}`; `painelVigConfigSalvar {key, config: {ancora, ciclo, postos}}`; `admVigLancar {sessao, lancamentos: [{periodo: AAAA-MM | P<AAAA-MM-DD>, posto, indicador, valor ('' apaga), justificativa}]}`; `admVigImportar {sessao, arquivo, itens}` (até 1.500 por chamada). Aba **`VigLancamentos`**: uma linha por célula (`id` = período|posto|indicador), `substitui`, `justificativa`, `origem` (manual/planilha), quem/quando; exclusão lógica.
