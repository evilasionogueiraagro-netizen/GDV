# Relatórios (Relatório GDV e central)

Aba **Relatórios** do painel (só admin): Relatório GDV mensal e anual e central de relatórios. Veja também: [VIGIFITO](vigifito.md), [convênio](convenio.md).

## Regras
- Relatório GDV: parcial mensal e consolidado anual, Seções I a VI, conclusão e três assinaturas (padrão: Gerente de Defesa Vegetal, Chefe do DDAF, Diretor-Presidente).
- Seção I: grupos em `CONFIG.RELGDV.grupos`; praga nova = termo numa coluna (vale o termo mais longo).
- Seção II (PCE): mensal = mês + acumulado; anual = jan–dez + total. "Novas" = menor data entre cadastro e 1º levantamento. Área: propriedades distintas no total.
- Seção II (VIGIFITO): total = fixas + volantes; TF sem turno conta como fixa.
- Manuais (portal): área, capacitação, medida fitossanitária, UP/UC, RT, termos, autos, liberação. Automáticas não se editam; ajuste em "Outros".
- `admRelLancar`: números ≥ 0 e contagens inteiras (decimais só em área controlada, ha, e quantidade das tabelas); texto sem CPF; chaves `vig.*` recusadas (VIGIFITO é por posto).
- Seções III a V: CFO/CFOC, PTV e educação sanitária lançados por mês; VI (HLB): e-GDV e armadilhas lançadas.
- Anexo (padrão no anual): produtor só com iniciais, CPF/CNPJ mascarado, coordenadas a 2 casas.
- Fonte: e-GDV (sem marca), lançado (†) ou substituído (‡: lançado que troca o e-GDV do posto e mês, com justificativa).
- Motor: cada número definido uma vez em `web/documentos/indicadores.js`. Barreiras: uma apuração (`motorBarreira_`, pela data de início do turno) para VIGIFITO, Relatório GDV e convênio 1.9/1.10.
- Painel só mostra e gera. Textos: salvos; senão do período anterior; senão padrão. Avisos: termo sem resultado > 30 dias.
- Central: PCE; VIGIFITO (mensal, 10 dias, semestral, anual; +.xlsx); Convênio; Consolidado.

## Dados
- `RelGdvTextos`: id `mensal|AAAA|MM` ou `anual|AAAA|`.
- `RelGdvLancamentos`: uma linha por mês e linha do quadro (`AAAA|MM|chave`).

## Código
- `web/painel/js/painel-relatorios.js` (central); `web/documentos/relgdv-docs.js` (cálculo, textos, Word e PDF); `web/documentos/relgdv-relatorio.html` (PDF); `web/painel/js/docx.js` (Word).
- `Code.gs`: `painelRelGdvApuracao` (até 1 ano; só agregados), `painelRelGdv`, `painelRelGdvSalvar`, `admRelLancar`, `motorBarreira_`.

## LGPD
- Relatório circula fora do e-GDV: sem nome nem CPF completo; anexo mascarado; servidor recusa CPF.
