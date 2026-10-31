# Termo de Fiscalização de Barreira (TF)

TF do app de campo (isolado ou no turno), impresso em 2 vias. Veja também: [app de campo](../apps/campo.md), [API](../API.md).

## Regras
- Não confundir: o TF de Barreira é só para irregularidade na barreira (`tf.html`). O Termo de Fiscalização de ação (fim do turno, fiscalização de propriedade) é outro documento, com outro template ([arquitetura](../arquitetura.md)).
- Barreiras do TF: aba `Barreiras`; a BVA cadastrada no painel entra nela (`barreiraDaBva_`).
- Numeração: uma sequência por barreira e ano, na planilha (`0012/2026 - BVA - CEASA`). Próximo = maior + 1. Início: e-GDV → Definir último nº de TF usado.
- `tfEmitir` grava só número livre; senão sugere outro antes do PDF.
- Sem internet: número provisório (último + 1). Se já usado, vale o mais antigo; o outro fica `conflito = 1`.
- Reincidente: TF anterior não cancelado, em qualquer barreira, do mesmo CPF/CNPJ ou placa válidos, com apreensão, rechaço ou auto. Não contam documento com dígito verificador errado ou todo igual (o 000.000.000-00 do talão) nem placa fora do padrão antigo ou Mercosul. O painel recalcula a reincidência de todos os TFs (`reincidenciaTFs_`). Não sai impresso. Sem internet: índice `tfIndiceReincidencia` (baixado no máx. a cada 30 min).
- Registro do veículo: placa com TF não cancelado na mesma BVA fica com borda vermelha e aviso (não bloqueia). Índice do aparelho com chave placa + BVA (BVA do turno do TF, senão o local do TF, com apelidos) + TFs do aparelho; vale sem internet. Índice antigo (sem `v: 2`) é baixado inteiro de novo.
- Alerta de cuidado (`Veiculos.cuidado`, `cuidadoMotivo`): placa com borda amarela e "Cuidado ao abordar este veículo" + 3 últimas observações, em qualquer BVA (índice `v: 3`, também com só o módulo de veículos). Não se desmarca no app (`gravar_`). Painel: `alertasCuidado` (7 dias), aviso, som e notificação até "Ciente".
- Duas vias, uma por folha A4.
- Textos: `CONFIG.TF.modelos` (constatação) e `CONFIG.TF.enquadramento` (BVA, sentido, produto).
- Auto de infração (caixa no TF): nº próprio por barreira/ano (`SEQUENCIAS.AI`), conferido no `tfEmitir`; sem internet, provisório (`autoConflito` se repetir). PDF em 3 vias (`auto.html`).
- UF de origem/destino opcionais (`CONFIG.ufs`, inclui "Exterior"); TF de veículo herda a UF do veículo.
- Fotos e assinaturas (fiscalizado e servidor) no Drive via `Arquivos`; `recusaAssinatura = 1` se o fiscalizado se recusa. O painel recebe só `nFotos` e `assinado`.
- Cancelar (motivo obrigatório): mantém o número e sai da reincidência. Cancelado e enviado pode sair da lista do aparelho; na planilha continua.
- TF antigo (digitar do papel): exige TF, PCE e Papel. Nº, data e hora digitados (futuro recusado). Com internet; número já usado na barreira/ano é recusado. Número maior: a sequência segue dele. Fiscalizado opcional (vazio = "NÃO IDENTIFICADO"); PDF escaneado (até 10, 10 MB) no lugar de fotos; sem turno.
- Mesmo TF (nº, ano, placa) numa carga do plantão importado: a carga conta só como veículo, o resto vem do TF. Jundiá: a barreira precisa estar em `Barreiras` e o Local do TF é o nome da BVA do posto no VIGIFITO.
- `verificar.html` (sem login, `tfVerificar`): nº, data, barreira, situação e placa mascarada. Nunca CPF/CNPJ, nome, endereço, telefone ou produtos. 30 ids inválidos por minuto: bloqueio de 1 min.

## Dados
- `TFs`: `auto*` (auto de infração; `autoDados` fora do painel); `numero`, `numeroOrigem` (`sistema`/`editado`/`provisorio`/`papel`), `numeroSugerido`, `conflito`, `cancelado`, `reincidente`, `registroAntigo`.
- `Numeracao` (`barreira|ano`, `ultimo`); `Pessoas` (CPF/CNPJ).

## Código
- `web/js/tf.js`, `web/documentos/tf.html` (impresso), `web/verificar.html`.
- `Code.gs`: `tfProximoNumero`, `tfEmitir`, `tfConsultar`, `tfIndiceReincidencia`, `tfVerificar`; `MODULO_DA_ACAO`.

## LGPD
- Fiscal baixa só os próprios TFs; outros cadastros só por consulta.
- Índice só com hashes (testáveis por tentativa de CPF): só para quem tem o módulo TF.
