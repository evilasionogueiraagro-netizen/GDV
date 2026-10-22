# Termo de Fiscalização de Barreira (TF)

TF do app de campo (isolado ou no turno), impresso em 2 vias. Veja também: [app de campo](../apps/campo.md), [API](../API.md).

## Regras
- Numeração: uma sequência por barreira e ano, na planilha (`0012/2026 - BVA - CEASA`). Próximo = maior + 1. Início: e-GDV → Definir último nº de TF usado.
- `tfEmitir` grava só número livre; senão sugere outro antes do PDF.
- Sem internet: número provisório (último + 1). Se já usado, vale o mais antigo; o outro fica `conflito = 1`.
- Reincidente: TF anterior não cancelado do mesmo CPF/CNPJ com apreensão, rechaço ou auto de infração, em qualquer barreira. Não sai impresso. Sem internet: índice `tfIndiceReincidencia` (baixado no máx. a cada 30 min).
- Duas vias, uma por folha A4.
- UF de origem/destino opcionais (`CONFIG.ufs`, inclui "Exterior"); TF de veículo herda a UF do veículo.
- Fotos e assinaturas (fiscalizado e servidor) no Drive via `Arquivos`; `recusaAssinatura = 1` se o fiscalizado se recusa. O painel recebe só `nFotos` e `assinado`.
- Cancelar (motivo obrigatório): mantém o número e sai da reincidência. Cancelado e enviado pode sair da lista do aparelho; na planilha continua.
- TF antigo (digitar do papel): exige TF, PCE e Papel. Nº, data e hora digitados (futuro recusado). Com internet; número já usado na barreira/ano é recusado. Número maior: a sequência segue dele. Fiscalizado opcional (vazio = "NÃO IDENTIFICADO"); PDF escaneado (até 10, 10 MB) no lugar de fotos; sem turno.
- Mesmo TF (nº, ano, placa) numa carga do plantão importado: a carga conta só como veículo, o resto vem do TF. Jundiá: a barreira precisa estar em `Barreiras` e o Local do TF é o nome da BVA do posto no VIGIFITO.
- `verificar.html` (sem login, `tfVerificar`): nº, data, barreira, situação e placa mascarada. Nunca CPF/CNPJ, nome, endereço, telefone ou produtos. 30 ids inválidos por minuto: bloqueio de 1 min.

## Dados
- `TFs`: `numero`, `numeroOrigem` (`sistema`/`editado`/`provisorio`/`papel`), `numeroSugerido`, `conflito`, `cancelado`, `reincidente`, `registroAntigo`.
- `Numeracao` (`barreira|ano`, `ultimo`); `Pessoas` (CPF/CNPJ).

## Código
- `web/js/tf.js`, `web/documentos/tf.html` (impresso), `web/verificar.html`.
- `Code.gs`: `tfProximoNumero`, `tfEmitir`, `tfConsultar`, `tfIndiceReincidencia`, `tfVerificar`; `MODULO_DA_ACAO`.

## LGPD
- Fiscal baixa só os próprios TFs; outros cadastros só por consulta.
- Índice só com hashes (testáveis por tentativa de CPF): só para quem tem o módulo TF.
