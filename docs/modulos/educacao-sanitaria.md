# Termo de Educação Sanitária

Módulo do app de campo independente do turno, do TF de Barreira e do PCE: não entra em relatório, Levantamento, painel de indicadores nem dashboard.

- Permissão `educacaoSanitaria` (módulo `educacao`), ligada pela gerência no painel. Sem ela o cartão some, o `sync` devolve o termo em `recusados` e as actions respondem `semPermissao`. Padrão do aparelho: desligado até o servidor mandar `educacao = 1`.
- Aba `TermosEducacao` (código: `educacao.gs`, `web/js/educacao.js`, modelo `web/documentos/educacao-termo.html`). `publicoAlvo` e `programas` são JSON; "Outro" guarda o texto em `publicoOutro`/`programaOutro`/`tipoMedidaOutro`. Tipos de medida e públicos: lista fixa em `educacao.gs` e `educacao-docs.js`; programas: `CONFIG.PCE.termo.programasRelatorio`.
- Obrigatórios: data (não futura), hora, município, local, tipo de medida, público-alvo, programas, descrição e pessoas orientadas (inteiro >= 0). Folders opcional (inteiro >= 0). O servidor confere os mesmos campos em `educacaoRegistrar`.
- Número `NNN.AAAA.UNIDADE` (unidade = lotação do servidor), sequência própria (`SEQUENCIAS.EDU`), independente da do Termo de Fiscalização do PCE. Online: `educacaoRegistrar` grava só se o número estiver livre, sob lock. Sem internet: provisório (último conhecido + 1), conferido no `sync`; repetido = `conflito = 1` e o mais antigo vale.
- Cancelar: `cancelado = 1` com motivo obrigatório; o número continua usado; nada é apagado (`excluido` fica para exclusão lógica). Só o autor altera o termo (`ABAS_COM_DONO_`). Toda gravação registra `usuario`; nome, cargo, matrícula e lotação do servidor vão copiados no termo.
- O servidor se identifica uma vez ("Meus dados", meta `educacaoServidor`; se já tinha os dados do PCE, vêm pré-preenchidos).
- Rascunho automático do formulário na meta `educacaoRascunho`. Aparelho novo: IndexedDB v6 (store `termosEducacao`).
- Sem fotos: o envio de arquivos (`arquivoEnviar`, `envio.js`) é do TF e do PCE; incluir fotos exigiria mexer nele (fica para depois).
